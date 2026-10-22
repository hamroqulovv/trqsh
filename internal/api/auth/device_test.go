package auth

import (
	"strings"
	"testing"
	"time"
)

func TestDeviceStoreCheck(t *testing.T) {
	d := newDeviceStore()
	req := d.Create()

	if err := d.Check("NEVER-ISSUED"); err != ErrDeviceUnknown {
		t.Fatalf("Check(unknown) = %v, want ErrDeviceUnknown", err)
	}
	if err := d.Check(req.UserCode); err != nil {
		t.Fatalf("Check(fresh code) = %v, want nil", err)
	}
	// Typed codes: case and surrounding space are not significant.
	if err := d.Check("  " + strings.ToLower(req.UserCode) + " "); err != nil {
		t.Fatalf("Check(lowercase, padded) = %v, want nil", err)
	}

	// Check must not change the flow: it is still pending, not approved.
	if _, err := d.Poll(req.DeviceCode); err != ErrDevicePending {
		t.Fatalf("Poll after Check = %v, want ErrDevicePending", err)
	}
}

func TestDeviceStoreCheckExpired(t *testing.T) {
	d := newDeviceStore()
	req := d.Create()
	d.byDevice[req.DeviceCode].CreatedAt = time.Now().Add(-(DeviceTTL + time.Minute))

	if err := d.Check(req.UserCode); err != ErrDeviceExpired {
		t.Fatalf("Check(expired) = %v, want ErrDeviceExpired", err)
	}
}

// A flow can be approved once. A second approval (a double submit) must not
// swap in a different key, and Check must say so before another key is minted.
func TestDeviceStoreApproveOnce(t *testing.T) {
	d := newDeviceStore()
	req := d.Create()

	if err := d.Approve(req.UserCode, "org_1", "first-key"); err != nil {
		t.Fatalf("first Approve: %v", err)
	}
	if err := d.Check(req.UserCode); err != ErrDeviceUnknown {
		t.Fatalf("Check(already approved) = %v, want ErrDeviceUnknown", err)
	}
	if err := d.Approve(req.UserCode, "org_2", "second-key"); err != ErrDeviceUnknown {
		t.Fatalf("second Approve = %v, want ErrDeviceUnknown", err)
	}
	key, err := d.Poll(req.DeviceCode)
	if err != nil || key != "first-key" {
		t.Fatalf("Poll = %q, %v; want the first approved key", key, err)
	}
}

func TestNormalizeUserCode(t *testing.T) {
	for in, want := range map[string]string{
		"WDJB-MJHT":    "WDJB-MJHT",
		" wdjb-mjht\n": "WDJB-MJHT",
		"":             "",
	} {
		if got := NormalizeUserCode(in); got != want {
			t.Errorf("NormalizeUserCode(%q) = %q, want %q", in, got, want)
		}
	}
}
