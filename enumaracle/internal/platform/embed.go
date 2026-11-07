package platform

import (
	"embed"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// Migrations holds platform's own schema (audit_log, settings).
//
//go:embed migrations/*.sql
var Migrations embed.FS

var errNotFound = core.ErrNotFound
