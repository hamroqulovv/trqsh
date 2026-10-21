package store

import (
	"context"
	"errors"
	"testing"
)

func TestMemOAuthSubjectPersistence(t *testing.T) { testOAuthSubjectPersistence(t, NewMemStore()) }

func testOAuthSubjectPersistence(t *testing.T, s Store) {
	t.Helper()
	ctx := context.Background()
	u, err := s.CreateUser(ctx, User{Email: "oauth-store@example.test", Name: "OAuth", OAuthProvider: "google", OAuthSubject: "store-google-1"})
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.GetUserByOAuth(ctx, "google", "store-google-1")
	if err != nil || got.ID != u.ID || got.OAuthSubject != "store-google-1" {
		t.Fatalf("identity lookup: %+v %v", got, err)
	}
	if got, err := s.GetUser(ctx, u.ID); err != nil || got.OAuthSubject != "store-google-1" {
		t.Fatalf("subject not persisted: %+v %v", got, err)
	}
	if _, err := s.CreateUser(ctx, User{Email: "duplicate@example.test", OAuthProvider: "google", OAuthSubject: "store-google-1"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate provider ID accepted: %v", err)
	}
	if _, err := s.CreateUser(ctx, User{Email: "OAUTH-STORE@example.test"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("case-variant duplicate email accepted: %v", err)
	}
	legacy, err := s.CreateUser(ctx, User{Email: "oauth-legacy@example.test", OAuthProvider: "github"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.BindOAuthSubject(ctx, legacy.ID, "github", "store-github-1"); err != nil {
		t.Fatal(err)
	}
	if err := s.BindOAuthSubject(ctx, legacy.ID, "github", "store-github-attacker"); !errors.Is(err, ErrConflict) {
		t.Fatalf("identity replaced: %v", err)
	}
	if err := s.BindOAuthSubject(ctx, legacy.ID, "google", "store-google-2"); !errors.Is(err, ErrConflict) {
		t.Fatalf("provider replaced: %v", err)
	}
	if got, err := s.GetUserByOAuth(ctx, "github", "store-github-1"); err != nil || got.ID != legacy.ID {
		t.Fatalf("legacy migration lost identity: %v", err)
	}
}
