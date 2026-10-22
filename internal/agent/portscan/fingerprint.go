package portscan

import (
	"fmt"
	"strings"
)

// signature is everything we know about a response, lower-cased once so the
// rules below stay readable.
type signature struct {
	r       response
	process string
	body    string // lower-cased
	server  string // lower-cased Server header
	powered string // lower-cased X-Powered-By header
	ctype   string // lower-cased media type
	title   string // lower-cased
}

func newSignature(r response, s *Service) signature {
	ct, _, _ := strings.Cut(strings.ToLower(r.header.Get("Content-Type")), ";")
	return signature{
		r:       r,
		process: s.Process,
		body:    strings.ToLower(r.body),
		server:  strings.ToLower(r.header.Get("Server")),
		powered: strings.ToLower(r.header.Get("X-Powered-By")),
		ctype:   strings.TrimSpace(ct),
		title:   strings.ToLower(r.title),
	}
}

func (g signature) bodyHas(subs ...string) bool {
	for _, s := range subs {
		if strings.Contains(g.body, s) {
			return true
		}
	}
	return false
}

func (g signature) isHTML() bool {
	return g.ctype == "text/html" || g.ctype == "application/xhtml+xml" ||
		(g.ctype == "" && g.bodyHas("<!doctype html", "<html"))
}

func (g signature) isJSON() bool {
	return strings.Contains(g.ctype, "json") ||
		(g.ctype == "" && (strings.HasPrefix(strings.TrimSpace(g.body), "{") || strings.HasPrefix(strings.TrimSpace(g.body), "[")))
}

// rules are tried in order; the first match names the app. Specific front-end
// frameworks come before generic servers, because the dev server's own header
// ("Server: nginx") says less than the page it serves.
var rules = []struct {
	app   string
	match func(g signature) bool
}{
	{"Next.js", func(g signature) bool {
		return strings.Contains(g.powered, "next.js") || g.bodyHas("/_next/", "__next_data__", "id=\"__next\"")
	}},
	{"Nuxt", func(g signature) bool { return g.bodyHas("/_nuxt/", "window.__nuxt__", "id=\"__nuxt\"") }},
	{"SvelteKit", func(g signature) bool { return g.bodyHas("sveltekit", "/_app/immutable") }},
	{"Astro", func(g signature) bool { return g.bodyHas("content=\"astro", "astro-island", "data-astro-cid") }},
	{"Remix", func(g signature) bool { return g.bodyHas("__remixcontext", "__remixmanifest") }},
	{"Gatsby", func(g signature) bool { return g.bodyHas("___gatsby", "content=\"gatsby") }},
	{"Docusaurus", func(g signature) bool { return g.bodyHas("content=\"docusaurus") }},
	{"VitePress", func(g signature) bool { return g.bodyHas("vitepress") }},
	{"Hugo", func(g signature) bool { return g.bodyHas("content=\"hugo") }},
	{"Jekyll", func(g signature) bool { return g.bodyHas("content=\"jekyll") }},
	{"Eleventy", func(g signature) bool { return g.bodyHas("content=\"eleventy") }},
	{"Storybook", func(g signature) bool {
		return strings.Contains(g.title, "storybook") || g.bodyHas("storybook-preview")
	}},
	{"Angular", func(g signature) bool { return g.bodyHas("ng-version=", "<app-root") }},
	{"Vite", func(g signature) bool { return g.bodyHas("/@vite/client", "/@react-refresh", "vite-plugin") }},
	{"Webpack dev server", func(g signature) bool {
		return g.bodyHas("webpack-dev-server", "/webpack-dev-server") || strings.Contains(g.powered, "webpack")
	}},
	{"React", func(g signature) bool {
		return g.bodyHas("you need to enable javascript to run this app") && g.bodyHas("id=\"root\"")
	}},
	{"Live Server", func(g signature) bool { return g.bodyHas("code injected by live-server") }},

	// tools with their own UI
	{"Jupyter", func(g signature) bool { return strings.Contains(g.title, "jupyter") }},
	{"Grafana", func(g signature) bool { return strings.Contains(g.title, "grafana") }},
	{"Prometheus", func(g signature) bool { return strings.Contains(g.title, "prometheus") }},
	{"Kibana", func(g signature) bool { return strings.Contains(g.title, "kibana") }},
	{"Elasticsearch", func(g signature) bool { return g.bodyHas("you know, for search") }},
	{"Swagger UI", func(g signature) bool { return strings.Contains(g.title, "swagger ui") }},
	{"Adminer", func(g signature) bool { return strings.Contains(g.title, "adminer") }},
	{"phpMyAdmin", func(g signature) bool { return strings.Contains(g.title, "phpmyadmin") }},
	{"Jenkins", func(g signature) bool { return g.r.header.Get("X-Jenkins") != "" }},
	{"MinIO", func(g signature) bool { return strings.Contains(g.server, "minio") }},
	{"Ollama", func(g signature) bool { return g.bodyHas("ollama is running") }},
	{"Home Assistant", func(g signature) bool { return strings.Contains(g.title, "home assistant") }},

	// back-end frameworks
	{"Django", func(g signature) bool {
		return g.bodyHas("csrfmiddlewaretoken", "django") || strings.Contains(strings.ToLower(strings.Join(g.r.header.Values("Set-Cookie"), ";")), "csrftoken")
	}},
	{"FastAPI", func(g signature) bool {
		return g.bodyHas("fastapi", "swagger-ui-dist") || (strings.Contains(g.server, "uvicorn") && g.bodyHas(`"detail"`))
	}},
	{"Flask", func(g signature) bool { return strings.Contains(g.server, "werkzeug") }},
	{"Express", func(g signature) bool { return strings.Contains(g.powered, "express") }},
	{"Rails", func(g signature) bool {
		return g.r.header.Get("X-Runtime") != "" && g.r.header.Get("X-Request-Id") != ""
	}},
	{"Laravel", func(g signature) bool {
		c := strings.ToLower(strings.Join(g.r.header.Values("Set-Cookie"), ";"))
		return strings.Contains(c, "laravel_session") || strings.Contains(c, "xsrf-token")
	}},
	{"Spring Boot", func(g signature) bool {
		return g.bodyHas("whitelabel error page") || g.r.header.Get("X-Application-Context") != ""
	}},
	{"ASP.NET", func(g signature) bool {
		return strings.Contains(g.powered, "asp.net") || strings.Contains(g.server, "kestrel")
	}},
	{"PHP", func(g signature) bool { return strings.Contains(g.powered, "php") || strings.Contains(g.server, "php") }},
	{"Python http.server", func(g signature) bool { return strings.Contains(g.server, "simplehttp") }},
	{"Uvicorn", func(g signature) bool { return strings.Contains(g.server, "uvicorn") }},
	{"Gunicorn", func(g signature) bool { return strings.Contains(g.server, "gunicorn") }},
	{"Puma", func(g signature) bool { return strings.Contains(g.server, "puma") }},

	// plain web servers
	{"nginx", func(g signature) bool { return strings.HasPrefix(g.server, "nginx") }},
	{"Apache", func(g signature) bool { return strings.HasPrefix(g.server, "apache") }},
	{"Caddy", func(g signature) bool { return strings.HasPrefix(g.server, "caddy") }},
	{"IIS", func(g signature) bool { return strings.HasPrefix(g.server, "microsoft-iis") }},
	{"Traefik", func(g signature) bool { return strings.Contains(g.server, "traefik") }},
}

// app names the software behind the response: a framework when one is
// recognised, else the language runtime of the owning process.
func (g signature) app() string {
	for _, r := range rules {
		if r.match(g) {
			return r.app
		}
	}
	return runtimeNames[g.process]
}

// kind decides web vs API vs other HTTP from the response.
func (g signature) kind() Kind {
	switch {
	case g.isHTML() && g.r.status < 500:
		return KindWeb
	case g.isJSON():
		return KindAPI
	case g.r.status/100 == 2 || g.r.status/100 == 3:
		return KindHTTP
	case g.isHTML():
		return KindWeb
	default:
		return KindHTTP
	}
}

// detail is one dim line of context: what the content is, and where a bare
// redirect went.
func (g signature) detail(redirect string) string {
	var parts []string
	switch {
	case g.isJSON():
		parts = append(parts, "JSON")
	case g.ctype != "" && !g.isHTML() && g.ctype != "text/plain":
		parts = append(parts, g.ctype)
	}
	if g.r.status != 0 && g.r.status != 200 {
		parts = append(parts, fmt.Sprint(g.r.status))
	}
	if redirect != "" {
		parts = append(parts, "→ "+redirect)
	}
	return strings.Join(parts, " · ")
}
