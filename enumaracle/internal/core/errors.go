package core

import (
	"errors"
	"fmt"
	"strings"
)

// Sentinel errors. platform maps them to HTTP status codes:
// NotFound 404, Conflict 409, Invalid 422, Forbidden 403, Unauthorized 401, State 409, RateLimited 429.
var (
	ErrNotFound     = errors.New("not found")
	ErrConflict     = errors.New("conflict")
	ErrInvalid      = errors.New("invalid input")
	ErrForbidden    = errors.New("forbidden")
	ErrUnauthorized = errors.New("unauthorized")
	ErrState        = errors.New("illegal state transition")
	ErrRateLimited  = errors.New("rate limited")
)

// FieldError describes one invalid input field; message is in Turkish for the portal.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationError collects field errors and unwraps to ErrInvalid.
type ValidationError struct{ Fields []FieldError }

func (v *ValidationError) Error() string {
	parts := make([]string, 0, len(v.Fields))
	for _, f := range v.Fields {
		parts = append(parts, f.Field+": "+f.Message)
	}
	return "invalid input: " + strings.Join(parts, "; ")
}

func (v *ValidationError) Unwrap() error { return ErrInvalid }

// Add records a field error.
func (v *ValidationError) Add(field, msg string) { v.Fields = append(v.Fields, FieldError{field, msg}) }

// Err returns nil when no field errors were recorded.
func (v *ValidationError) Err() error {
	if v == nil || len(v.Fields) == 0 {
		return nil
	}
	return v
}

// Invalid returns a single-field validation error.
func Invalid(field, msg string) error {
	return &ValidationError{Fields: []FieldError{{field, msg}}}
}

// Errorf wraps a sentinel with context: core.Errorf(core.ErrNotFound, "entity %s", id).
func Errorf(sentinel error, format string, args ...any) error {
	return fmt.Errorf("%w: %s", sentinel, fmt.Sprintf(format, args...))
}
