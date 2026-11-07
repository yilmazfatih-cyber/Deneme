package auth

import (
	"context"
	"database/sql"
	"errors"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

const userCols = `id, email, name, role, entity_id, active, last_login_at, created_at`

type userRow struct {
	core.User
	hash string
}

func scanUser(sc interface{ Scan(...any) error }, withHash bool, extra ...any) (userRow, error) {
	var u userRow
	var active int
	var lastLogin, created string
	dest := []any{&u.ID, &u.Email, &u.Name, &u.Role, &u.EntityID, &active, &lastLogin, &created}
	if withHash {
		dest = append(dest, &u.hash)
	}
	dest = append(dest, extra...)
	if err := sc.Scan(dest...); err != nil {
		return u, err
	}
	u.Active = active == 1
	u.LastLoginAt = platform.ParseTSPtr(lastLogin)
	u.CreatedAt = platform.ParseTS(created)
	return u, nil
}

func normalizeEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

func validRole(r core.Role) bool { _, ok := core.RoleScopes[r]; return ok }

func isEnterpriseRole(r core.Role) bool {
	return r == core.RoleEnterpriseOwner || r == core.RoleEnterpriseUser
}

func validatePassword(v *core.ValidationError, pw string) {
	switch {
	case utf8.RuneCountInString(pw) < MinPasswordLength:
		v.Add("password", "parola en az 10 karakter olmalı")
	case len(pw) > maxPasswordBytes:
		v.Add("password", "parola çok uzun")
	}
}

// CreateUser implements core.Accounts. Duplicate email -> ErrConflict.
// It opens its own transaction: callers must not hold an open transaction
// on the same SQLite database while calling it.
func (s *Service) CreateUser(ctx context.Context, nu core.NewUser) (core.User, error) {
	email := normalizeEmail(nu.Email)
	name := strings.TrimSpace(nu.Name)
	v := &core.ValidationError{}
	if a, err := mail.ParseAddress(email); err != nil || a.Address != email || len(email) > 254 {
		v.Add("email", "geçerli bir e-posta adresi girin")
	}
	if name == "" || utf8.RuneCountInString(name) > 200 {
		v.Add("name", "ad 1-200 karakter olmalı")
	}
	validatePassword(v, nu.Password)
	switch {
	case !validRole(nu.Role):
		v.Add("role", "geçersiz rol")
	case isEnterpriseRole(nu.Role) && strings.TrimSpace(nu.EntityID) == "":
		v.Add("entity_id", "kurumsal kullanıcı için kuruluş gerekli")
	case !isEnterpriseRole(nu.Role) && nu.EntityID != "":
		v.Add("entity_id", "operatör kullanıcısı bir kuruluşa bağlanamaz")
	}
	if err := v.Err(); err != nil {
		return core.User{}, err
	}
	hash, err := HashPassword(nu.Password, s.params)
	if err != nil {
		return core.User{}, err
	}
	now := s.now()
	u := core.User{ID: core.NewID(), Email: email, Name: name, Role: nu.Role,
		EntityID: strings.TrimSpace(nu.EntityID), Active: true, CreatedAt: now}
	err = s.db.InTx(ctx, func(tx *platform.Tx) error {
		var x string
		err := tx.QueryRowContext(ctx, `SELECT id FROM users WHERE email = ?`, email).Scan(&x)
		if err == nil {
			return core.Errorf(core.ErrConflict, "bu e-posta adresi zaten kayıtlı")
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO users (id, email, name, role, entity_id, password_hash, active, last_login_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, 1, '', ?, ?)`,
			u.ID, u.Email, u.Name, string(u.Role), u.EntityID, hash, platform.TS(now), platform.TS(now))
		if platform.IsUniqueViolation(err) {
			return core.Errorf(core.ErrConflict, "bu e-posta adresi zaten kayıtlı")
		}
		if err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "user.create", "user", u.ID,
			map[string]any{"email": u.Email, "role": u.Role, "entity_id": u.EntityID})
	})
	if err != nil {
		return core.User{}, err
	}
	return u, nil
}

// GetUser returns a user by id.
func (s *Service) GetUser(ctx context.Context, id string) (core.User, error) {
	u, err := scanUser(s.db.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id = ?`, id), false)
	if err != nil {
		return core.User{}, platform.NotFound(err, "kullanıcı")
	}
	return u.User, nil
}

func (s *Service) userByEmail(ctx context.Context, email string) (userRow, error) {
	return scanUser(s.db.QueryRowContext(ctx, `SELECT `+userCols+`, password_hash FROM users WHERE email = ?`, email), true)
}

// ListUsers returns all users, newest first.
func (s *Service) ListUsers(ctx context.Context) ([]core.User, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+userCols+` FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.User{}
	for rows.Next() {
		u, err := scanUser(rows, false)
		if err != nil {
			return nil, err
		}
		out = append(out, u.User)
	}
	return out, rows.Err()
}

// SetActive activates or deactivates a user. Deactivation deletes the
// user's sessions; an operator cannot deactivate their own account.
func (s *Service) SetActive(ctx context.Context, id string, active bool) (core.User, error) {
	p := core.PrincipalFrom(ctx)
	if !active && p.Kind == "user" && p.ID == id {
		return core.User{}, core.Errorf(core.ErrConflict, "kendi hesabınızı pasifleştiremezsiniz")
	}
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		u, err := scanUser(tx.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id = ?`, id), false)
		if err != nil {
			return platform.NotFound(err, "kullanıcı")
		}
		if u.Active == active {
			return nil
		}
		if _, err := tx.ExecContext(ctx, `UPDATE users SET active = ?, updated_at = ? WHERE id = ?`,
			platform.Bool(active), platform.TS(s.now()), id); err != nil {
			return err
		}
		if !active {
			if _, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = ?`, id); err != nil {
				return err
			}
		}
		action := "user.activate"
		if !active {
			action = "user.deactivate"
		}
		return platform.Audit(ctx, tx, action, "user", id, map[string]any{"email": u.Email})
	})
	if err != nil {
		return core.User{}, err
	}
	return s.GetUser(ctx, id)
}

// Bootstrap creates the operator admin from config when no operator_admin
// exists. With an empty Cfg.AdminPassword a random password is generated and
// logged once at WARN level. Calling it again is a no-op.
func (s *Service) Bootstrap(ctx context.Context) error {
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = ?`,
		string(core.RoleOperatorAdmin)).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	pw, generated := s.base.Cfg.AdminPassword, false
	if pw == "" {
		pw, generated = randomToken(18), true
	}
	ctx = withActor(ctx, core.SystemPrincipal)
	u, err := s.CreateUser(ctx, core.NewUser{Email: s.base.Cfg.AdminEmail, Name: "Operatör Yöneticisi",
		Password: pw, Role: core.RoleOperatorAdmin})
	if err != nil {
		return err
	}
	if generated {
		s.logWarn("BOOTSTRAP: operator admin created with a GENERATED password. It is shown only this once; "+
			"log in and store it securely (or set ENUMARACLE_ADMIN_PASSWORD).",
			"email", u.Email, "password", pw)
	} else if s.base.Log != nil {
		s.base.Log.Info("bootstrap: operator admin created from ENUMARACLE_ADMIN_PASSWORD", "email", u.Email)
	}
	return nil
}
