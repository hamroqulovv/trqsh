package portscan

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"html"
	"io"
	"net"
	"net/http"
	"net/netip"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"unicode"
)

// bodyLimit is how much of a response is read for fingerprinting. A page's
// <head> (title, generator, framework script paths) is almost always inside it.
const bodyLimit = 24 << 10

// probeAll classifies every service in place, running the probes in parallel.
func probeAll(ctx context.Context, svcs []Service) {
	sem := make(chan struct{}, maxParallel)
	var wg sync.WaitGroup
	for i := range svcs {
		s := &svcs[i]
		if classify(s) {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			probe(ctx, s)
		}()
	}
	wg.Wait()
}

// probe asks the service for "/" and fills in what it learns. A service that
// doesn't speak HTTP keeps Kind tcp.
func probe(ctx context.Context, s *Service) {
	ctx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()

	ip := s.ip
	if !ip.IsValid() {
		ip = netip.AddrFrom4([4]byte{127, 0, 0, 1})
	}
	r, ok := fetch(ctx, ip, s.Port, "/")
	if !ok {
		if r.banner != "" {
			s.Detail = r.banner
		}
		s.App = runtimeNames[s.Process]
		return
	}

	// Follow one same-origin redirect (/ → /login, /en) so the title and
	// framework come from a real page rather than a 302 stub.
	redirect := ""
	if r.status/100 == 3 {
		if loc := r.header.Get("Location"); loc != "" {
			if path, ok := sameOriginPath(loc, s.Port); ok && path != "/" {
				redirect = path
				if r2, ok2 := fetch(ctx, ip, s.Port, path); ok2 && r2.status/100 != 3 {
					r2.header = mergeHeaders(r.header, r2.header)
					r = r2
				}
			}
		}
	}

	s.Scheme, s.Status = r.scheme, r.status
	s.Title = r.title
	sig := newSignature(r, s)
	s.App = sig.app()
	s.Kind = sig.kind()
	s.Detail = sig.detail(redirect)
}

type response struct {
	scheme string
	status int
	header http.Header
	body   string
	title  string
	banner string // first printable bytes of a non-HTTP greeting
}

// fetch sends GET path to ip:port and parses the reply. It tries plain HTTP
// first and falls back to TLS when the server hangs up or answers with a TLS
// record, which is how an https-only dev server (mkcert, Vite --https) behaves.
func fetch(ctx context.Context, ip netip.Addr, port int, path string) (response, bool) {
	addr := net.JoinHostPort(ip.String(), strconv.Itoa(port))
	r, retryTLS, ok := fetchOnce(ctx, addr, port, path, false)
	if ok || !retryTLS {
		return r, ok
	}
	tr, _, tok := fetchOnce(ctx, addr, port, path, true)
	if tok {
		return tr, true
	}
	return r, false
}

func fetchOnce(ctx context.Context, addr string, port int, path string, useTLS bool) (r response, retryTLS, ok bool) {
	d := net.Dialer{Timeout: dialTimeout}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return r, false, false
	}
	defer conn.Close()
	if dl, has := ctx.Deadline(); has {
		_ = conn.SetDeadline(dl)
	}
	r.scheme = "http"
	if useTLS {
		tc := tls.Client(conn, &tls.Config{
			InsecureSkipVerify: true, // loopback dev certs are self-signed; nothing is sent but GET /
			ServerName:         "localhost",
			NextProtos:         []string{"http/1.1"},
		})
		if err := tc.HandshakeContext(ctx); err != nil {
			return r, false, false
		}
		conn, r.scheme = tc, "https"
	}

	_, err = fmt.Fprintf(conn,
		"GET %s HTTP/1.1\r\nHost: localhost:%d\r\nUser-Agent: trqsh-portscan\r\n"+
			"Accept: text/html,application/json;q=0.9,*/*;q=0.8\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n",
		path, port)
	if err != nil {
		return r, !useTLS, false
	}

	br := bufio.NewReaderSize(conn, 4096)
	first, err := br.Peek(1)
	if err != nil {
		// Closed (or silent) on a plain request: maybe TLS-only.
		return r, !useTLS && !isTimeout(err), false
	}
	if first[0] == 0x15 || first[0] == 0x16 { // TLS alert / handshake record
		return r, !useTLS, false
	}
	peek, _ := br.Peek(5)
	if string(peek) != "HTTP/" {
		r.banner = banner(br)
		return r, false, false
	}

	resp, err := http.ReadResponse(br, &http.Request{Method: http.MethodGet})
	if err != nil {
		return r, false, false
	}
	defer resp.Body.Close()
	// nginx/Go answer a plain request to a TLS port with a 400 that says so.
	if !useTLS && resp.StatusCode == http.StatusBadRequest {
		head, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		if strings.Contains(strings.ToLower(string(head)), "https") {
			return r, true, false
		}
		r.body = string(head)
	}
	r.status, r.header = resp.StatusCode, resp.Header
	if r.body == "" {
		r.body = readBody(resp.Body)
	}
	r.title = pageTitle(r.body)
	return r, false, true
}

func isTimeout(err error) bool {
	ne, ok := err.(net.Error)
	return ok && ne.Timeout()
}

// readBody reads up to bodyLimit bytes, stopping early once the document head
// has been seen. A slow or streaming body just yields what arrived by the
// deadline.
func readBody(rd io.Reader) string {
	var sb strings.Builder
	buf := make([]byte, 4096)
	for sb.Len() < bodyLimit {
		n, err := rd.Read(buf)
		sb.Write(buf[:n])
		if strings.Contains(strings.ToLower(sb.String()), "</head>") {
			break
		}
		if err != nil {
			break
		}
	}
	return sb.String()
}

var titleRe = regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`)

// pageTitle extracts a clean, single-line <title>.
func pageTitle(body string) string {
	m := titleRe.FindStringSubmatch(body)
	if m == nil {
		return ""
	}
	t := html.UnescapeString(m[1])
	t = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, t)
	t = strings.Join(strings.Fields(t), " ")
	if r := []rune(t); len(r) > 80 {
		t = string(r[:79]) + "…"
	}
	return t
}

// banner returns the printable start of a non-HTTP greeting ("SSH-2.0-…",
// "220 smtp ready"), enough to recognise the protocol.
func banner(br *bufio.Reader) string {
	b, _ := br.Peek(64)
	var sb strings.Builder
	for _, c := range string(b) {
		if c == '\r' || c == '\n' {
			break
		}
		if c < 32 || c > 126 {
			continue
		}
		sb.WriteRune(c)
	}
	return strings.TrimSpace(sb.String())
}

// sameOriginPath returns the path of a Location header when it stays on this
// server (relative, or the same host:port).
func sameOriginPath(loc string, port int) (string, bool) {
	if strings.HasPrefix(loc, "/") && !strings.HasPrefix(loc, "//") {
		return loc, true
	}
	for _, scheme := range []string{"http://", "https://"} {
		if rest, ok := strings.CutPrefix(loc, scheme); ok {
			host, path, _ := strings.Cut(rest, "/")
			h, p, err := net.SplitHostPort(host)
			if err != nil {
				h, p = host, map[string]string{"http://": "80", "https://": "443"}[scheme]
			}
			if (h == "localhost" || h == "127.0.0.1" || h == "[::1]" || h == "::1") && p == strconv.Itoa(port) {
				return "/" + path, true
			}
		}
	}
	return "", false
}

// mergeHeaders keeps headers from the first response that the final page lacks
// (a redirecting proxy often sets Server / X-Powered-By).
func mergeHeaders(first, second http.Header) http.Header {
	out := second.Clone()
	for k, v := range first {
		if _, ok := out[k]; !ok && k != "Location" && k != "Content-Length" {
			out[k] = v
		}
	}
	return out
}

// fallbackServices is used when the OS can't list sockets: it dials the usual
// dev ports and reports the ones that answer, so the feature degrades to the
// old behaviour instead of vanishing.
func fallbackServices(ctx context.Context, skip []int) []Service {
	var mu sync.Mutex
	var out []Service
	var wg sync.WaitGroup
	d := net.Dialer{Timeout: dialTimeout}
	for p := range devPortRank {
		if slices.Contains(skip, p) {
			continue
		}
		wg.Go(func() {
			c, err := d.DialContext(ctx, "tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(p)))
			if err != nil {
				return
			}
			_ = c.Close()
			mu.Lock()
			out = append(out, Service{Port: p, ip: netip.AddrFrom4([4]byte{127, 0, 0, 1})})
			mu.Unlock()
		})
	}
	wg.Wait()
	return out
}
