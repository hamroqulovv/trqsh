package api

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"sync"
)

// The admin console is a dependency-free single-page app (plain ES modules, no
// bundler) embedded in the API binary and served same-origin at approve.<base>:
// the session cookie, the CSRF/Origin guards and the /v1/admin/* API all stay on
// one origin, and `go build` remains the only build step.

//go:embed adminui
var adminUIFS embed.FS

const adminAssetPrefix = "/admin-assets/"

// adminCSP is strict on purpose: only same-origin scripts and styles, no inline
// code, no framing. The SPA is written to satisfy it (styles are set through the
// CSSOM, never through style attributes).
const adminCSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
	"connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

var adminAssetTags = sync.OnceValue(func() map[string]string {
	tags := map[string]string{}
	_ = fs.WalkDir(adminUIFS, "adminui", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		b, rerr := adminUIFS.ReadFile(p)
		if rerr != nil {
			return rerr
		}
		sum := sha256.Sum256(b)
		tags[strings.TrimPrefix(p, "adminui/")] = `"` + hex.EncodeToString(sum[:8]) + `"`
		return nil
	})
	return tags
})

// adminHostAllowed applies the same gate to the page and its assets: hidden when
// the console is disabled and, in production, served only on approve.<base>.
func (s *Server) adminHostAllowed(r *http.Request) bool {
	return s.adminEnabled() && (!s.cfg.IsProduction() || s.isAdminHost(r))
}

func adminSecurityHeaders(h http.Header) {
	h.Set("Content-Security-Policy", adminCSP)
	h.Set("X-Frame-Options", "DENY")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Robots-Tag", "noindex, nofollow")
}

// serveAdminFile writes one embedded file with validators so the browser
// revalidates cheaply instead of re-downloading the app on every visit.
func serveAdminFile(w http.ResponseWriter, r *http.Request, name string) {
	b, err := adminUIFS.ReadFile("adminui/" + name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	adminSecurityHeaders(w.Header())
	if ct := mime.TypeByExtension(path.Ext(name)); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	if tag := adminAssetTags()[name]; tag != "" {
		w.Header().Set("ETag", tag)
		if r.Header.Get("If-None-Match") == tag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	_, _ = w.Write(b)
}

func (s *Server) handleAdminPage(w http.ResponseWriter, r *http.Request) {
	if !s.adminHostAllowed(r) {
		http.NotFound(w, r)
		return
	}
	serveAdminFile(w, r, "index.html")
}

func (s *Server) handleAdminAsset(w http.ResponseWriter, r *http.Request) {
	if !s.adminHostAllowed(r) {
		http.NotFound(w, r)
		return
	}
	name := path.Clean(strings.TrimPrefix(r.URL.Path, adminAssetPrefix))
	if name == "." || name == "index.html" || strings.HasPrefix(name, "..") || strings.HasPrefix(name, "/") {
		http.NotFound(w, r)
		return
	}
	serveAdminFile(w, r, name)
}
