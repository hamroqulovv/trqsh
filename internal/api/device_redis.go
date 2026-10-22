package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/trqsh-uz/trqsh/internal/api/auth"
)

// redisDevicePrefix namespaces the device-authorization flow in a Redis
// instance shared with the route registry (trqsh:route:), cert storage
// (trqsh:certmagic:), rate limiter (trqsh:rl:) and OAuth state
// (trqsh:oauthstate:).
const redisDevicePrefix = "trqsh:device:"

// redisDeviceSafetyMargin extends the Redis key TTL beyond auth.DeviceTTL so
// Redis itself is only a cleanup backstop for abandoned flows, never the
// authoritative expiry check — Poll below still compares against CreatedAt,
// exactly like the in-process store, so it can keep returning the distinct
// ErrDeviceExpired (vs. ErrDeviceUnknown) the CLI depends on.
const redisDeviceSafetyMargin = 5 * time.Minute

var _ auth.DeviceStore = (*redisDeviceStore)(nil)

// redisDeviceStore is the shared, cross-replica auth.DeviceStore: the CLI's
// Poll() and the browser-driven Approve() can land on different API
// replicas, so both must see one shared record. codeKey holds the
// JSON-encoded auth.DeviceRequest; userKey maps a user_code to its
// device_code (mirrors the in-process store's byDevice/byUser split).
type redisDeviceStore struct {
	rdb     *redis.Client
	timeout time.Duration
	log     *slog.Logger

	warnMu   sync.Mutex
	lastWarn time.Time
}

func newRedisDeviceStore(rdb *redis.Client, log *slog.Logger) *redisDeviceStore {
	if log == nil {
		log = slog.Default()
	}
	return &redisDeviceStore{rdb: rdb, timeout: redisAllowTimeout, log: log}
}

func (s *redisDeviceStore) codeKey(deviceCode string) string {
	return redisDevicePrefix + "code:" + deviceCode
}
func (s *redisDeviceStore) userKey(userCode string) string {
	return redisDevicePrefix + "user:" + userCode
}

// Create starts a new device flow. A write failure is logged, not fatal: the
// returned codes simply won't resolve at Approve/Poll, so the flow fails
// closed (the CLI times out and the user retries) rather than silently
// dropping the approval later.
func (s *redisDeviceStore) Create() *auth.DeviceRequest {
	req := &auth.DeviceRequest{
		DeviceCode: auth.NewDeviceCode(),
		UserCode:   auth.NewUserCode(),
		CreatedAt:  time.Now(),
	}
	ctx, cancel := context.WithTimeout(context.Background(), s.timeout)
	defer cancel()

	ttl := auth.DeviceTTL + redisDeviceSafetyMargin
	buf, err := json.Marshal(req) // #nosec G117 -- persisted to our own Redis store by design; this is how Approve later hands the key back to Poll
	if err != nil {
		s.warn(err)
		return req
	}
	pipe := s.rdb.TxPipeline()
	pipe.Set(ctx, s.codeKey(req.DeviceCode), buf, ttl)
	pipe.Set(ctx, s.userKey(req.UserCode), req.DeviceCode, ttl)
	if _, err := pipe.Exec(ctx); err != nil {
		s.warn(err)
	}
	return req
}

// load resolves a typed user_code to its device_code and stored record. Any
// failure — a code that was never issued, a vanished record, or Redis being
// unavailable — is ErrDeviceUnknown, so the flow fails closed.
func (s *redisDeviceStore) load(ctx context.Context, userCode string) (string, auth.DeviceRequest, error) {
	var req auth.DeviceRequest
	deviceCode, err := s.rdb.Get(ctx, s.userKey(auth.NormalizeUserCode(userCode))).Result()
	if err == redis.Nil {
		return "", req, auth.ErrDeviceUnknown
	}
	if err != nil {
		s.warn(err)
		return "", req, auth.ErrDeviceUnknown
	}

	raw, err := s.rdb.Get(ctx, s.codeKey(deviceCode)).Result()
	if err == redis.Nil {
		return "", req, auth.ErrDeviceUnknown
	}
	if err != nil {
		s.warn(err)
		return "", req, auth.ErrDeviceUnknown
	}
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		s.warn(err)
		return "", req, auth.ErrDeviceUnknown
	}
	return deviceCode, req, nil
}

// Check reports whether userCode can still be approved, without side effects.
func (s *redisDeviceStore) Check(userCode string) error {
	ctx, cancel := context.WithTimeout(context.Background(), s.timeout)
	defer cancel()

	_, req, err := s.load(ctx, userCode)
	switch {
	case err != nil:
		return err
	case req.Approved:
		return auth.ErrDeviceUnknown
	case time.Since(req.CreatedAt) > auth.DeviceTTL:
		return auth.ErrDeviceExpired
	}
	return nil
}

// Approve links a user_code to an org and the minted API key. It does not
// itself reject an expired flow (matching the in-process store: expiry is
// only enforced lazily, at Poll; callers use Check first) — KeepTTL preserves
// the original Create TTL so approving does not extend an abandoned flow's
// lifetime. An already-approved flow is refused so a second approval cannot
// replace the key the CLI is about to receive. The read-then-write is not
// atomic across replicas; the caller revokes the key it minted if this fails.
func (s *redisDeviceStore) Approve(userCode, orgID, apiKey string) error {
	ctx, cancel := context.WithTimeout(context.Background(), s.timeout)
	defer cancel()

	deviceCode, req, err := s.load(ctx, userCode)
	if err != nil {
		return err
	}
	if req.Approved {
		return auth.ErrDeviceUnknown
	}

	req.Approved = true
	req.OrgID = orgID
	req.APIKey = apiKey
	buf, err := json.Marshal(req) // #nosec G117 -- persisted to our own Redis store by design, same as Create above
	if err != nil {
		s.warn(err)
		return auth.ErrDeviceUnknown
	}
	if err := s.rdb.Set(ctx, s.codeKey(deviceCode), buf, redis.KeepTTL).Err(); err != nil {
		s.warn(err)
		return auth.ErrDeviceUnknown
	}
	return nil
}

// Poll returns the API key once the flow is approved, else a pending/expired
// error, and consumes the record on either a successful or expired read —
// exactly like the in-process store's delete-on-terminal-outcome behavior.
func (s *redisDeviceStore) Poll(deviceCode string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), s.timeout)
	defer cancel()

	raw, err := s.rdb.Get(ctx, s.codeKey(deviceCode)).Result()
	if err == redis.Nil {
		return "", auth.ErrDeviceUnknown
	}
	if err != nil {
		s.warn(err)
		return "", auth.ErrDeviceUnknown
	}
	var req auth.DeviceRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		s.warn(err)
		return "", auth.ErrDeviceUnknown
	}

	if time.Since(req.CreatedAt) > auth.DeviceTTL {
		s.delete(ctx, deviceCode, req.UserCode)
		return "", auth.ErrDeviceExpired
	}
	if !req.Approved {
		return "", auth.ErrDevicePending
	}
	s.delete(ctx, deviceCode, req.UserCode)
	return req.APIKey, nil
}

func (s *redisDeviceStore) delete(ctx context.Context, deviceCode, userCode string) {
	pipe := s.rdb.TxPipeline()
	pipe.Del(ctx, s.codeKey(deviceCode))
	pipe.Del(ctx, s.userKey(userCode))
	if _, err := pipe.Exec(ctx); err != nil {
		s.warn(err)
	}
}

// warn logs a Redis-unavailability warning at most once per 30s so an outage
// during the device flow does not produce a warning per poll.
func (s *redisDeviceStore) warn(err error) {
	s.warnMu.Lock()
	defer s.warnMu.Unlock()
	if time.Since(s.lastWarn) < 30*time.Second {
		return
	}
	s.lastWarn = time.Now()
	s.log.Warn("device store: redis unavailable", "err", err)
}
