package auth

import (
	"github.com/golang-jwt/jwt/v5"
	"github.com/trqsh-uz/trqsh/internal/api/store"
	"testing"
	"time"
)

func TestLegacyDomainSessionRejected(t *testing.T) {
	a := New(store.NewMemStore(), "test-secret")
	for _, kind := range []string{"access", "refresh"} {
		legacy, err := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{OrgID: "org", Kind: kind, RegisteredClaims: jwt.RegisteredClaims{Subject: "user", Issuer: "trqsh-api", ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour))}}).SignedString(a.secret)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := a.ParseToken(legacy); err == nil {
			t.Fatal("pre-isolation session still authenticates")
		}
	}
	fresh, err := a.IssueTokens("user", "org")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.ParseToken(fresh.Access); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Refresh(fresh.Refresh); err != nil {
		t.Fatal(err)
	}
}
