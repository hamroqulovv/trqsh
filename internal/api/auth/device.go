package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"
)

// Device-flow errors.
var (
	ErrDevicePending = errors.New("authorization_pending")
	ErrDeviceExpired = errors.New("expired_token")
	ErrDeviceUnknown = errors.New("invalid_device_code")
)

// DeviceRequest tracks one device-authorization flow (RFC 8628-style).
type DeviceRequest struct {
	DeviceCode string
	UserCode   string
	OrgID      string
	APIKey     string // minted on approval, delivered once to the CLI
	Approved   bool
	CreatedAt  time.Time
}

// DeviceTTL bounds how long a device-authorization flow stays pollable before
// Poll starts returning ErrDeviceExpired. Exported so internal/api's
// Redis-backed DeviceStore (for multi-replica deployments) can match it
// exactly rather than duplicating the value.
const DeviceTTL = 10 * time.Minute

// DeviceStore is the device-authorization flow's storage seam. newDeviceStore
// (used by New, below) is the in-process default that serves a single API
// replica; internal/api provides a Redis-backed implementation — injected via
// Auth.SetDevices — for deployments running more than one replica, since the
// CLI polls Poll() on whichever replica a load balancer picks, which is not
// necessarily the replica Approve() landed on.
type DeviceStore interface {
	Create() *DeviceRequest
	// Check reports whether userCode names a flow that can still be approved,
	// without changing it: nil, ErrDeviceUnknown (never issued, or already
	// approved), or ErrDeviceExpired. Callers run it before minting the API key
	// that Approve hands over, so a bad code never creates a credential.
	Check(userCode string) error
	// Approve links a user_code to an org and the minted API key. It fails with
	// ErrDeviceUnknown if the code is unknown or was already approved.
	Approve(userCode, orgID, apiKey string) error
	Poll(deviceCode string) (string, error)
}

// NormalizeUserCode canonicalises a typed user_code (case and surrounding
// space are not significant). Every DeviceStore must look codes up this way, so
// the in-process and Redis-backed stores accept exactly the same input.
func NormalizeUserCode(userCode string) string {
	return strings.ToUpper(strings.TrimSpace(userCode))
}

var _ DeviceStore = (*deviceStore)(nil)

type deviceStore struct {
	mu       sync.Mutex
	byDevice map[string]*DeviceRequest
	byUser   map[string]string // user_code -> device_code
}

func newDeviceStore() *deviceStore {
	return &deviceStore{
		byDevice: make(map[string]*DeviceRequest),
		byUser:   make(map[string]string),
	}
}

// Create starts a new device flow and returns its codes.
func (d *deviceStore) Create() *DeviceRequest {
	req := &DeviceRequest{
		DeviceCode: NewDeviceCode(),
		UserCode:   NewUserCode(),
		CreatedAt:  time.Now(),
	}
	d.mu.Lock()
	d.byDevice[req.DeviceCode] = req
	d.byUser[req.UserCode] = req.DeviceCode
	d.mu.Unlock()
	return req
}

// Check reports whether userCode can still be approved, without side effects.
func (d *deviceStore) Check(userCode string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	req := d.lookup(userCode)
	switch {
	case req == nil || req.Approved:
		return ErrDeviceUnknown
	case time.Since(req.CreatedAt) > DeviceTTL:
		return ErrDeviceExpired
	}
	return nil
}

// lookup finds a flow by user_code; the caller holds d.mu.
func (d *deviceStore) lookup(userCode string) *DeviceRequest {
	dc, ok := d.byUser[NormalizeUserCode(userCode)]
	if !ok {
		return nil
	}
	return d.byDevice[dc]
}

// Approve links a user_code to an org and the minted API key. An already
// approved flow is refused: the first key is the one the CLI will receive, and
// a second approval (a double submit) must not replace it.
func (d *deviceStore) Approve(userCode, orgID, apiKey string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	req := d.lookup(userCode)
	if req == nil || req.Approved {
		return ErrDeviceUnknown
	}
	req.Approved = true
	req.OrgID = orgID
	req.APIKey = apiKey
	return nil
}

// Poll returns the API key once the flow is approved, else a pending/expired error.
func (d *deviceStore) Poll(deviceCode string) (string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	req, ok := d.byDevice[deviceCode]
	if !ok {
		return "", ErrDeviceUnknown
	}
	if time.Since(req.CreatedAt) > DeviceTTL {
		delete(d.byDevice, deviceCode)
		delete(d.byUser, req.UserCode)
		return "", ErrDeviceExpired
	}
	if !req.Approved {
		return "", ErrDevicePending
	}
	key := req.APIKey
	delete(d.byDevice, deviceCode)
	delete(d.byUser, req.UserCode)
	return key, nil
}

// NewDeviceCode returns a fresh device_code. Exported so internal/api's
// Redis-backed DeviceStore generates codes identically to the in-process one,
// instead of duplicating the format.
func NewDeviceCode() string { return randToken(16) }

// NewUserCode returns a fresh, human-typable user_code. Exported for the same
// reason as NewDeviceCode.
func NewUserCode() string { return randUserCode() }

func randToken(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// randUserCode returns a short, human-typable code like "WDJB-MJHT".
func randUserCode() string {
	const alphabet = "BCDFGHJKLMNPQRSTVWXZ0123456789"
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	out := make([]byte, 0, 9)
	for i, c := range b {
		if i == 4 {
			out = append(out, '-')
		}
		out = append(out, alphabet[int(c)%len(alphabet)])
	}
	return string(out)
}
