// Package portal serves the React portal built from web/ into dist/.
package portal

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed all:dist
var dist embed.FS

// Handler serves /app/* with SPA fallback to index.html.
func Handler() http.Handler {
	sub, _ := fs.Sub(dist, "dist")
	files := http.FileServer(http.FS(sub))
	return http.StripPrefix("/app", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(sub, p); err != nil {
			r.URL.Path = "/"
		}
		if strings.HasPrefix(p, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	}))
}
