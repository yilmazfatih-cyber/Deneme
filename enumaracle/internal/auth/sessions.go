package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// errBadLogin is the single, non-enumerating login failure.
var errBadLogin = core.Errorf(core.ErrUnauthorized, "e-posta veya parola hatalı")

// Session is the result of a successful login. Token is the raw cookie value;
// only its sha256 is stored.
type Session struct {
	Token     string
	CSRF      string
	User      core.User
	ExpiresAt time.Time
}

func pruneFails(v []time.Time, now time.Time) []time.Time {
	cut := now.Add(-LoginWindow)
	i := 0
	for i < len(v) && !v[i].After(cut) {
		i++
	}
	return v[i:]
}

func throttleKey(email, ip string) string { return email + "|" + ip }

func (s *Service) throttled(key string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	v := pruneFails(s.fails[key], now)
	s.fails[key] = v
	return len(v) >= LoginMaxFailures
}

func (s *Service) recordFailure(key string, now time.Time) {
	s.mu.Lock()
	s.fails[key] = append(pruneFails(s.fails[key], now), now)
	s.mu.Unlock()
}

func (s *Service) resetFailures(key string) {
	s.mu.Lock()
	delete(s.fails, key)
	s.mu.Unlock()
}

// Login verifies credentials and creates a fresh session. oldToken (the
// caller's current cookie, may be empty) is deleted so a pre-set session id
// can never survive login (no session fixation). Errors never reveal whether
// the email exists.
func (s *Service) Login(ctx context.Context, email, password, oldToken, userAgent string) (Session, error) {
	email = normalizeEmail(email)
	ip := platform.ClientIP(ctx)
	key := throttleKey(email, ip)
	now := s.now()
	if s.throttled(key, now) {
		_ = platform.Audit(ctx, s.db, "auth.login_failure", "login", email, map[string]any{"reason": "throttled"})
		return Session{}, core.Errorf(core.ErrRateLimited, "çok fazla başarısız giriş denemesi; 15 dakika sonra tekrar deneyin")
	}
	u, err := s.userByEmail(ctx, email)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Session{}, err
	}
	hash := s.dummy
	if err == nil {
		hash = u.hash
	}
	ok := VerifyPassword(password, hash) // always run argon2 for uniform timing
	reason := ""
	switch {
	case err != nil:
		reason = "unknown_email"
	case !ok:
		reason = "bad_password"
	case !u.Active:
		reason = "inactive"
	}
	if reason != "" {
		s.recordFailure(key, now)
		_ = platform.Audit(ctx, s.db, "auth.login_failure", "login", email, map[string]any{"reason": reason})
		return Session{}, errBadLogin
	}
	s.resetFailures(key)

	sess := Session{Token: randomToken(32), CSRF: randomToken(32), User: u.User, ExpiresAt: now.Add(SessionTTL)}
	sess.User.LastLoginAt = &now
	actx := withActor(ctx, userPrincipal(u.User, ""))
	if len(userAgent) > 256 {
		userAgent = userAgent[:256]
	}
	err = s.db.InTx(ctx, func(tx *platform.Tx) error {
		if oldToken != "" {
			if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, sha256Hex(oldToken)); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO sessions (id, token_hash, user_id, csrf_token, ip, user_agent, created_at, expires_at, last_seen_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, core.NewID(), sha256Hex(sess.Token), u.ID, sess.CSRF, ip, userAgent,
			platform.TS(now), platform.TS(sess.ExpiresAt), platform.TS(now)); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE users SET last_login_at = ? WHERE id = ?`, platform.TS(now), u.ID); err != nil {
			return err
		}
		return platform.Audit(actx, tx, "auth.login_success", "user", u.ID, map[string]any{"email": email})
	})
	if err != nil {
		return Session{}, err
	}
	return sess, nil
}

// Logout deletes the session server-side (no-op for unknown tokens).
func (s *Service) Logout(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	return s.db.InTx(ctx, func(tx *platform.Tx) error {
		var id, userID string
		err := tx.QueryRowContext(ctx, `SELECT id, user_id FROM sessions WHERE token_hash = ?`, sha256Hex(token)).Scan(&id, &userID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "auth.logout", "user", userID, nil)
	})
}

// sessionPrincipal resolves a session cookie. Unknown or expired tokens give
// (anonymous, nil) so that a stale cookie never blocks /auth/login; protected
// routes still answer 401. A session of a deactivated user is deleted and
// yields ErrUnauthorized.
func (s *Service) sessionPrincipal(ctx context.Context, token string) (core.Principal, error) {
	anon := core.Principal{Kind: "anonymous"}
	if len(token) < 16 || len(token) > 128 {
		return anon, nil
	}
	th := sha256Hex(token)
	var sid, csrf, expires, lastSeen string
	u, err := scanUser(s.db.QueryRowContext(ctx, `SELECT u.id, u.email, u.name, u.role, u.entity_id, u.active, u.last_login_at, u.created_at,
		s.id, s.csrf_token, s.expires_at, s.last_seen_at
		FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`, th), false, &sid, &csrf, &expires, &lastSeen)
	if errors.Is(err, sql.ErrNoRows) {
		return anon, nil
	}
	if err != nil {
		return anon, err
	}
	now := s.now()
	if !platform.ParseTS(expires).After(now) {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, sid)
		return anon, nil
	}
	if !u.Active {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, u.ID)
		return anon, core.Errorf(core.ErrUnauthorized, "hesap pasif")
	}
	if now.Sub(platform.ParseTS(lastSeen)) >= lastSeenEvery {
		if _, err := s.db.ExecContext(ctx, `UPDATE sessions SET last_seen_at = ? WHERE id = ?`, platform.TS(now), sid); err != nil {
			return anon, err
		}
	}
	return userPrincipal(u.User, csrf), nil
}

// Authenticate implements core.Authenticator. A bearer API key takes
// precedence over a session cookie when both are sent.
func (s *Service) Authenticate(ctx context.Context, cookieValue, bearer string) (core.Principal, error) {
	if bearer != "" {
		return s.apiKeyPrincipal(ctx, bearer)
	}
	if cookieValue != "" {
		return s.sessionPrincipal(ctx, cookieValue)
	}
	return core.Principal{Kind: "anonymous"}, nil
}
