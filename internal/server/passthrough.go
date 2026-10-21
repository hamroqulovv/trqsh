package server

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

// TLS passthrough lets an unrelated service share this edge's public :443
// without the edge terminating its TLS. The edge peeks the ClientHello SNI and,
// for a configured hostname, splices the raw TCP connection (ClientHello
// included) to that service's own TLS listener. The service keeps its own
// certificate and trust model; removing the entry (e.g. once the service moves
// to its own server) is the whole migration on the edge side.
//
//	TRQSH_TLS_PASSTHROUGH="stars.trqsh.uz=f-bot-nginx:443?allow=cloudflare"
//
// Entries are whitespace-separated. Options:
//
//	allow=cloudflare,203.0.113.0/24  only these client source ranges may reach
//	                                 the backend ("cloudflare" = its published
//	                                 ranges); others are dropped. Empty = any.
//	proxy=v1                         prepend a PROXY protocol v1 header so the
//	                                 backend sees the real client address.
//
// Plain HTTP for a passthrough host is answered with a redirect to HTTPS, and
// HTTP/2 or HTTP/3 requests that reach the edge for it get 421.
type PassthroughRoute struct {
	Backend       string // host:port of the backend's TLS listener
	Allow         []netip.Prefix
	ProxyProtocol bool
}

// cloudflareRanges are Cloudflare's published proxy ranges (checked
// 2026-10-18; https://www.cloudflare.com/ips-v4 and /ips-v6).
var cloudflareRanges = []string{
	"173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
	"141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
	"197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
	"104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
	"2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
	"2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
}

// ParsePassthrough parses TRQSH_TLS_PASSTHROUGH into routes keyed by hostname.
func ParsePassthrough(spec string) (map[string]PassthroughRoute, error) {
	routes := map[string]PassthroughRoute{}
	for _, entry := range strings.Fields(spec) {
		host, rest, ok := strings.Cut(entry, "=")
		host = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
		if !ok || host == "" || rest == "" {
			return nil, fmt.Errorf("server: TRQSH_TLS_PASSTHROUGH entry %q: want host=backend:port[?options]", entry)
		}
		backend, rawOpts, _ := strings.Cut(rest, "?")
		if _, port, err := net.SplitHostPort(backend); err != nil || port == "" {
			return nil, fmt.Errorf("server: TRQSH_TLS_PASSTHROUGH %s: backend %q must be host:port", host, backend)
		}
		opts, err := url.ParseQuery(rawOpts)
		if err != nil {
			return nil, fmt.Errorf("server: TRQSH_TLS_PASSTHROUGH %s: options: %w", host, err)
		}
		r := PassthroughRoute{Backend: backend}
		for _, a := range strings.Split(opts.Get("allow"), ",") {
			switch a = strings.TrimSpace(a); {
			case a == "":
			case strings.EqualFold(a, "cloudflare"):
				for _, c := range cloudflareRanges {
					r.Allow = append(r.Allow, netip.MustParsePrefix(c))
				}
			default:
				p, err := netip.ParsePrefix(a)
				if err != nil {
					addr, aerr := netip.ParseAddr(a)
					if aerr != nil {
						return nil, fmt.Errorf("server: TRQSH_TLS_PASSTHROUGH %s: allow %q is not a CIDR or IP", host, a)
					}
					p = netip.PrefixFrom(addr, addr.BitLen())
				}
				r.Allow = append(r.Allow, p.Masked())
			}
		}
		switch v := opts.Get("proxy"); v {
		case "":
		case "v1":
			r.ProxyProtocol = true
		default:
			return nil, fmt.Errorf("server: TRQSH_TLS_PASSTHROUGH %s: unsupported proxy=%q (want v1)", host, v)
		}
		if _, dup := routes[host]; dup {
			return nil, fmt.Errorf("server: TRQSH_TLS_PASSTHROUGH: duplicate host %s", host)
		}
		routes[host] = r
	}
	return routes, nil
}

func (s *Server) passthroughFor(host string) (PassthroughRoute, bool) {
	r, ok := s.cfg.Passthrough[hostOnly(host)]
	return r, ok
}

func (r PassthroughRoute) allows(remote net.Addr) bool {
	if len(r.Allow) == 0 {
		return true
	}
	ap, err := netip.ParseAddrPort(remote.String())
	if err != nil {
		return false
	}
	ip := ap.Addr().Unmap()
	for _, p := range r.Allow {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}

// acceptHTTPSPassthrough is the HTTPS accept loop used when passthrough routes
// are configured: each raw connection's ClientHello is peeked first, so the
// edge can either splice it to a passthrough backend or replay it into the
// normal TLS ingress.
func (s *Server) acceptHTTPSPassthrough(ctx context.Context, ln net.Listener, tlsConf *tls.Config) {
	for {
		c, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			continue
		}
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			_ = c.SetReadDeadline(time.Now().Add(10 * time.Second))
			sni, prefix := peekSNI(c)
			_ = c.SetReadDeadline(time.Time{})
			replay := &prefixConn{Conn: c, r: io.MultiReader(bytes.NewReader(prefix), c)}
			if route, ok := s.passthroughFor(sni); ok {
				s.passthrough(c, replay, route)
				return
			}
			s.serveIngressConn(ctx, tls.Server(replay, tlsConf), "https")
		}()
	}
}

// passthrough splices a public TLS connection to its backend unmodified.
func (s *Server) passthrough(client net.Conn, clientRead io.Reader, route PassthroughRoute) {
	if !route.allows(client.RemoteAddr()) {
		s.metrics.Errors.WithLabelValues("passthrough_denied").Inc()
		_ = client.Close()
		return
	}
	backend, err := net.DialTimeout("tcp", route.Backend, 5*time.Second)
	if err != nil {
		s.metrics.Errors.WithLabelValues("passthrough_unreachable").Inc()
		_ = client.Close()
		return
	}
	if route.ProxyProtocol {
		if _, err := io.WriteString(backend, proxyV1Header(client.RemoteAddr(), client.LocalAddr())); err != nil {
			_ = backend.Close()
			_ = client.Close()
			return
		}
	}
	rawJoin(client, clientRead, backend)
}

func proxyV1Header(src, dst net.Addr) string {
	sa, serr := netip.ParseAddrPort(src.String())
	da, derr := netip.ParseAddrPort(dst.String())
	if serr != nil || derr != nil {
		return "PROXY UNKNOWN\r\n"
	}
	s, d := sa.Addr().Unmap(), da.Addr().Unmap()
	fam := "TCP4"
	if s.Is6() || d.Is6() {
		fam = "TCP6"
		s, d = netip.AddrFrom16(s.As16()), netip.AddrFrom16(d.As16())
	}
	return fmt.Sprintf("PROXY %s %s %s %d %d\r\n", fam, s, d, sa.Port(), da.Port())
}

var errSNIPeeked = errors.New("sni peeked")

// peekSNI reads the ClientHello from c and returns its server name together
// with every byte consumed, so the caller can replay them. The name is empty
// when the hello is malformed or carries no SNI.
func peekSNI(c net.Conn) (string, []byte) {
	var buf bytes.Buffer
	var sni string
	_ = tls.Server(readOnlyConn{r: io.TeeReader(c, &buf)}, &tls.Config{
		GetConfigForClient: func(h *tls.ClientHelloInfo) (*tls.Config, error) {
			sni = h.ServerName
			return nil, errSNIPeeked
		},
	}).Handshake()
	return strings.ToLower(sni), buf.Bytes()
}

// readOnlyConn feeds a TLS handshake bytes from r and swallows everything the
// handshake tries to send, so peeking never writes to the client.
type readOnlyConn struct{ r io.Reader }

func (c readOnlyConn) Read(p []byte) (int, error)     { return c.r.Read(p) }
func (readOnlyConn) Write([]byte) (int, error)        { return 0, io.ErrClosedPipe }
func (readOnlyConn) Close() error                     { return nil }
func (readOnlyConn) LocalAddr() net.Addr              { return nil }
func (readOnlyConn) RemoteAddr() net.Addr             { return nil }
func (readOnlyConn) SetDeadline(time.Time) error      { return nil }
func (readOnlyConn) SetReadDeadline(time.Time) error  { return nil }
func (readOnlyConn) SetWriteDeadline(time.Time) error { return nil }

// prefixConn replays already-consumed bytes before reading from the conn.
type prefixConn struct {
	net.Conn
	r io.Reader
}

func (c *prefixConn) Read(p []byte) (int, error) { return c.r.Read(p) }
