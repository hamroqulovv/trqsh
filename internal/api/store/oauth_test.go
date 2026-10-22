package store

import (
	"context"
	"errors"
	"slices"
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
	if _, err := s.GetUserByEmail(ctx, "duplicate@example.test"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("rejected user was still created: %v", err)
	}
	if _, err := s.CreateUser(ctx, User{Email: "OAUTH-STORE@example.test"}); !errors.Is(err, ErrConflict) {
		t.Fatalf("case-variant duplicate email accepted: %v", err)
	}

	// An account created before provider IDs were stored gets one on first link.
	legacy, err := s.CreateUser(ctx, User{Email: "oauth-legacy@example.test", OAuthProvider: "github"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.LinkOAuthIdentity(ctx, legacy.ID, "github", "store-github-1"); err != nil {
		t.Fatal(err)
	}
	if err := s.LinkOAuthIdentity(ctx, legacy.ID, "github", "store-github-1"); err != nil {
		t.Fatalf("re-linking the same account must be a no-op: %v", err)
	}
	if err := s.LinkOAuthIdentity(ctx, legacy.ID, "github", "store-github-attacker"); !errors.Is(err, ErrConflict) {
		t.Fatalf("second account from the same provider linked: %v", err)
	}
	if got, err := s.GetUser(ctx, legacy.ID); err != nil || got.OAuthSubject != "store-github-1" {
		t.Fatalf("legacy subject not back-filled: %+v %v", got, err)
	}

	// One account, several providers.
	if err := s.LinkOAuthIdentity(ctx, legacy.ID, "google", "store-google-2"); err != nil {
		t.Fatalf("second provider not linked: %v", err)
	}
	if got, err := s.GetUserByOAuth(ctx, "google", "store-google-2"); err != nil || got.ID != legacy.ID {
		t.Fatalf("linked provider does not resolve to the account: %+v %v", got, err)
	}
	if got, err := s.GetUserByOAuth(ctx, "github", "store-github-1"); err != nil || got.ID != legacy.ID {
		t.Fatalf("original provider lost after linking another: %v", err)
	}
	if providers, err := s.ListOAuthProviders(ctx, legacy.ID); err != nil || !slices.Equal(providers, []string{"github", "google"}) {
		t.Fatalf("linked providers: %v %v", providers, err)
	}
	if err := s.LinkOAuthIdentity(ctx, legacy.ID, "google", "store-google-1"); !errors.Is(err, ErrConflict) {
		t.Fatalf("provider account owned by another user was linked: %v", err)
	}
	if got, err := s.GetUserByOAuth(ctx, "google", "store-google-1"); err != nil || got.ID != u.ID {
		t.Fatalf("failed link moved the provider account: %+v %v", got, err)
	}
}
