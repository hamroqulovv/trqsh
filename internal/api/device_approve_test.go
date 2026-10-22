package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/trqsh-uz/trqsh/internal/api/auth"
)

// deviceFixture is a server with one signed-in owner, plus helpers that call
// the approve handler as that owner.
type deviceFixture struct {
	s *Server
	p auth.Principal
}

func newDeviceFixture(t *testing.T) deviceFixture {
	t.Helper()
	s := newTestServer(t)
	u, org, err := s.provisionOAuthUser(context.Background(), auth.OAuthUser{
		Provider: "github", Subject: "device-test", Email: "device@example.test", Name: "Device Owner",
	})
	if err != nil {
		t.Fatal(err)
	}
	return deviceFixture{s: s, p: auth.Principal{UserID: u.ID, OrgID: org.ID}}
}

func (f deviceFixture) approve(t *testing.T, userCode string) *httptest.ResponseRecorder {
	t.Helper()
	body := `{"user_code":"` + userCode + `"}`
	req := httptest.NewRequest(http.MethodPost, "/v1/auth/device/approve", strings.NewReader(body))
	req = req.WithContext(auth.WithPrincipal(req.Context(), f.p))
	rec := httptest.NewRecorder()
	f.s.handleDeviceApprove(rec, req)
	return rec
}

// deviceKeys counts the org's keys minted by the device flow.
func (f deviceFixture) deviceKeys(t *testing.T) (live, revoked int) {
	t.Helper()
	keys, err := f.s.store.ListAPIKeys(context.Background(), f.p.OrgID)
	if err != nil {
		t.Fatal(err)
	}
	for _, k := range keys {
		if k.Name != "cli-device" {
			continue
		}
		if k.RevokedAt != nil {
			revoked++
		} else {
			live++
		}
	}
	return live, revoked
}

// The bug: approve minted a key first and only then looked the code up, so every
// wrong code left a live, undeliverable credential in the org.
func TestDeviceApproveInvalidCodeMintsNoKey(t *testing.T) {
	f := newDeviceFixture(t)

	for _, code := range []string{"NOPE-NOPE", "", "   ", "wdjb-mjht"} {
		rec := f.approve(t, code)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("approve(%q) = %d, want 400", code, rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "invalid_device_code") {
			t.Errorf("approve(%q) body = %s, want invalid_device_code", code, rec.Body.String())
		}
	}
	if live, revoked := f.deviceKeys(t); live != 0 || revoked != 0 {
		t.Fatalf("invalid codes left keys behind: live=%d revoked=%d, want none", live, revoked)
	}
}

func TestDeviceApproveMintsExactlyOneKey(t *testing.T) {
	f := newDeviceFixture(t)
	code := f.s.auth.Devices().Create()

	// A hand-typed code: wrong case and stray space still approve.
	rec := f.approve(t, " "+strings.ToLower(code.UserCode)+" ")
	if rec.Code != http.StatusOK {
		t.Fatalf("approve = %d (%s), want 200", rec.Code, rec.Body.String())
	}
	if live, _ := f.deviceKeys(t); live != 1 {
		t.Fatalf("live device keys = %d, want 1", live)
	}

	// A double submit is refused and does not mint a second key.
	if again := f.approve(t, code.UserCode); again.Code != http.StatusBadRequest {
		t.Fatalf("second approve = %d, want 400", again.Code)
	}
	if live, revoked := f.deviceKeys(t); live != 1 || revoked != 0 {
		t.Fatalf("after double submit live=%d revoked=%d, want 1 and 0", live, revoked)
	}

	// The CLI receives the key that was minted.
	key, err := f.s.auth.Devices().Poll(code.DeviceCode)
	if err != nil || !strings.HasPrefix(key, "tq_live_") {
		t.Fatalf("Poll = %q, %v; want a tq_live_ key", key, err)
	}
}

// racingDevices lets Check pass and then loses the approval, as happens when
// the flow expires or a concurrent request approves it between the two calls.
type racingDevices struct{ auth.DeviceStore }

func (racingDevices) Approve(string, string, string) error { return auth.ErrDeviceUnknown }

func TestDeviceApproveRevokesKeyWhenApprovalLosesRace(t *testing.T) {
	f := newDeviceFixture(t)
	code := f.s.auth.Devices().Create()
	f.s.auth.SetDevices(racingDevices{f.s.auth.Devices()})

	rec := f.approve(t, code.UserCode)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("approve = %d, want 400", rec.Code)
	}
	// The key was minted before approval failed; it must not stay usable.
	if live, revoked := f.deviceKeys(t); live != 0 || revoked != 1 {
		t.Fatalf("live=%d revoked=%d, want the undelivered key revoked (0 live, 1 revoked)", live, revoked)
	}
}
