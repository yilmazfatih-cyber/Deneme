package core

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// NewID returns a random UUID string used as primary key everywhere.
func NewID() string { return uuid.NewString() }

// Clock is injectable time for tests.
type Clock func() time.Time

func SystemClock() time.Time { return time.Now().UTC() }

// LookupService answers "who owns this number, is it verified, what to display".
// Implemented by registry. Used by api handlers, enumdns and pki.
type LookupService interface {
	Lookup(ctx context.Context, tn string) (LookupResult, error)
}

// EntityDirectory gives read access to entities and numbers. Implemented by registry.
type EntityDirectory interface {
	GetEntity(ctx context.Context, id string) (Entity, error)
	// NumberOwner returns the non-released number (or range) containing tn and its entity.
	NumberOwner(ctx context.Context, tn string) (Number, Entity, error)
	// NumbersOf lists an entity's non-released numbers.
	NumbersOf(ctx context.Context, entityID string) ([]Number, error)
	// ApprovedBranding returns the approved branding for a number (override, else entity default).
	ApprovedBranding(ctx context.Context, n Number) (Branding, bool, error)
}

// ReputationReader returns the latest score of a number. ok=false when no data.
// Implemented by reputation.
type ReputationReader interface {
	ScoreFor(ctx context.Context, tn string) (s Score, ok bool, err error)
}

// ReputationAdmin lets other packages (disputes) apply an operator override.
type ReputationAdmin interface {
	SetOverride(ctx context.Context, tn string, label ReputationLabel, reason, setBy string, until time.Time) error
}

// Notifier publishes domain events to webhooks and the email outbox. Implemented by notify.
// Notify must not block on network I/O; deliveries are queued.
type Notifier interface {
	Notify(ctx context.Context, e Event) error
}

// Accounts creates portal users. Implemented by auth; used by registry signup.
type Accounts interface {
	CreateUser(ctx context.Context, u NewUser) (User, error)
}

// Authenticator resolves the caller of an HTTP request from a session cookie
// or an "Authorization: Bearer enm_..." API key. Implemented by auth.
// It returns (anonymous principal, nil) when no credentials are present and
// ErrUnauthorized / ErrRateLimited on bad credentials or exceeded limits.
type Authenticator interface {
	Authenticate(ctx context.Context, cookieValue, bearer string) (Principal, error)
}

// NopNotifier discards events (tests).
type NopNotifier struct{}

func (NopNotifier) Notify(context.Context, Event) error { return nil }

type principalKey struct{}

// WithPrincipal stores the caller in the context.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// PrincipalFrom returns the caller, or an anonymous principal.
func PrincipalFrom(ctx context.Context) Principal {
	if p, ok := ctx.Value(principalKey{}).(Principal); ok {
		return p
	}
	return Principal{Kind: "anonymous"}
}
