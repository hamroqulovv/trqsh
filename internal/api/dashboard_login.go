package api

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/trqsh-uz/trqsh/internal/api/auth"
)

const dashboardLoginTTL = time.Minute

type dashboardLogin struct {
	Tokens  auth.Tokens `json:"tokens"`
	State   string      `json:"state"`
	Next    string      `json:"next"`
	Expires time.Time   `json:"expires"`
}

// Codes contain no credentials and are consumed atomically. Redis supports
// exchanging a code on a different API replica from the OAuth callback.
type dashboardLoginStore struct {
	mu      sync.Mutex
	entries map[string]dashboardLogin
	rdb     *redis.Client
}

func newDashboardLoginStore(rdb *redis.Client) *dashboardLoginStore {
	return &dashboardLoginStore{entries: make(map[string]dashboardLogin), rdb: rdb}
}

func (s *dashboardLoginStore) issue(ctx context.Context, login dashboardLogin) (string, error) {
	var nonce [32]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return "", err
	}
	code := hex.EncodeToString(nonce[:])
	login.Expires = time.Now().Add(dashboardLoginTTL)
	if s.rdb != nil {
		data, err := json.Marshal(login)
		if err != nil {
			return "", err
		}
		return code, s.rdb.Set(ctx, "trqsh:dashboardlogin:"+code, data, dashboardLoginTTL).Err()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, entry := range s.entries {
		if !time.Now().Before(entry.Expires) {
			delete(s.entries, key)
		}
	}
	s.entries[code] = login
	return code, nil
}

func (s *dashboardLoginStore) take(ctx context.Context, code, state string) (dashboardLogin, error) {
	var login dashboardLogin
	if len(code) != 64 || state == "" {
		return login, errors.New("invalid login code")
	}
	if s.rdb != nil {
		data, err := s.rdb.GetDel(ctx, "trqsh:dashboardlogin:"+code).Bytes()
		if err != nil {
			return login, err
		}
		if err := json.Unmarshal(data, &login); err != nil {
			return login, err
		}
	} else {
		s.mu.Lock()
		login = s.entries[code]
		delete(s.entries, code)
		s.mu.Unlock()
	}
	if !time.Now().Before(login.Expires) || subtle.ConstantTimeCompare([]byte(state), []byte(login.State)) != 1 {
		return dashboardLogin{}, errors.New("invalid login code")
	}
	return login, nil
}

func (s *Server) handleDashboardExchange(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code  string `json:"code"`
		State string `json:"state"`
	}
	if !decode(w, r, &req) {
		return
	}
	login, err := s.dashboardLogins.take(r.Context(), req.Code, req.State)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid or expired login code")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, login)
}
