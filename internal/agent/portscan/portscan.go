// Package portscan finds what is listening on this machine's localhost and
// works out what each thing is — a Vite dev server, a Django API, Postgres, a
// desktop app's background helper — so the console can offer to share it.
//
// A scan has two stages, both bounded and parallel so the whole thing takes
// tens to a few hundred milliseconds regardless of how many ports are open:
//
//  1. Enumerate every listening TCP socket straight from the OS (a kernel
//     table read: no connection attempts, no guessing at port numbers), with
//     the owning process.
//  2. Probe each candidate with one short HTTP request to learn whether it is
//     a website, an API or something else, and fingerprint the framework.
//
// Only loopback-reachable listeners are reported, and nothing ever leaves the
// machine. Databases, SSH and OS services are classified from the process and
// well-known port and never sent an HTTP request.
package portscan

import (
	"context"
	"net/netip"
	"slices"
	"strings"
	"sync"
	"time"
)

// Kind is the coarse type of a listening service, ordered by how useful it is
// as a tunnel target.
type Kind string

const (
	KindWeb      Kind = "web"      // answers with an HTML page
	KindAPI      Kind = "api"      // answers with JSON / data
	KindHTTP     Kind = "http"     // speaks HTTP but nothing more is known
	KindDatabase Kind = "database" // a database, cache or message broker
	KindTCP      Kind = "tcp"      // accepts connections, protocol unknown
	KindSystem   Kind = "system"   // OS service or desktop-app helper
)

// Shareable reports whether the service is a sensible `/http` target.
func (k Kind) Shareable() bool { return k == KindWeb || k == KindAPI || k == KindHTTP }

func (k Kind) rank() int {
	switch k {
	case KindWeb:
		return 0
	case KindAPI:
		return 1
	case KindHTTP:
		return 2
	case KindDatabase:
		return 3
	case KindTCP:
		return 4
	default:
		return 5
	}
}

// Service is one listening port on localhost.
type Service struct {
	Port    int    `json:"port"`
	Kind    Kind   `json:"kind"`
	App     string `json:"app,omitempty"`     // "Vite", "Django", "PostgreSQL"
	Title   string `json:"title,omitempty"`   // page <title>
	Detail  string `json:"detail,omitempty"`  // one-line extra: "JSON · 200", "→ /login"
	Process string `json:"process,omitempty"` // "node", "python"
	PID     int    `json:"pid,omitempty"`
	Scheme  string `json:"scheme,omitempty"` // "http" or "https" when it speaks HTTP
	Status  int    `json:"status,omitempty"` // HTTP status of GET /
	// Network is true when the socket is bound to every interface (0.0.0.0 / ::),
	// i.e. reachable from the LAN, not only from this machine.
	Network bool `json:"network,omitempty"`

	ip netip.Addr // address to dial: a loopback address this socket accepts on
}

// Name is the short human label: the detected app, else the process.
func (s Service) Name() string {
	switch {
	case s.App != "":
		return s.App
	case s.Process != "":
		return s.Process
	}
	switch s.Kind {
	case KindWeb:
		return "Website"
	case KindAPI:
		return "API"
	case KindHTTP:
		return "HTTP server"
	case KindDatabase, KindTCP:
		return "TCP service"
	default:
		return "Unknown"
	}
}

// Result is the outcome of a Scan.
type Result struct {
	Services []Service     // sorted: most useful first
	Took     time.Duration // wall time of the whole scan
	Fallback bool          // the OS table was unavailable; only common dev ports were checked
}

// Options tunes a Scan.
type Options struct {
	// Skip lists ports to leave out entirely (trqsh's own control API).
	Skip []int
}

// Timeouts are deliberately tight: everything probed is on loopback, where a
// healthy server answers in a millisecond or two.
const (
	dialTimeout  = 250 * time.Millisecond
	probeTimeout = 650 * time.Millisecond
	maxParallel  = 48
)

// Scan enumerates and classifies every listening localhost port. It always
// returns a usable Result; ctx bounds the probe stage.
func Scan(ctx context.Context, opts Options) Result {
	start := time.Now()
	ls, err := listeners(ctx)
	var res Result
	var svcs []Service
	if err != nil {
		res.Fallback = true
		svcs = fallbackServices(ctx, opts.Skip)
	} else {
		svcs = fromListeners(ls, opts.Skip)
	}
	probeAll(ctx, svcs)
	sortServices(svcs)
	res.Services = svcs
	res.Took = time.Since(start)
	return res
}

// listener is one raw listening socket from the OS.
type listener struct {
	ip   netip.Addr
	port int
	pid  int
	// name is the owning process when the OS table already provides it
	// (lsof does); otherwise it is resolved from pid.
	name string
}

// fromListeners merges the raw sockets (IPv4 and IPv6 give two per port) into
// one Service per port, drops anything not reachable via localhost, and
// attaches process names.
func fromListeners(ls []listener, skip []int) []Service {
	byPort := map[int]*Service{}
	for _, l := range ls {
		if slices.Contains(skip, l.port) || l.port <= 0 {
			continue
		}
		ip := l.ip.Unmap()
		reach, ok := reachableIP(ip)
		if !ok {
			continue // bound to a LAN address only: localhost can't reach it
		}
		s := byPort[l.port]
		if s == nil {
			s = &Service{Port: l.port, PID: l.pid, Process: l.name, ip: reach}
			byPort[l.port] = s
		} else if reach.Is4() && !s.ip.Is4() {
			s.ip = reach // prefer the IPv4 loopback when both exist
		}
		if ip.IsUnspecified() {
			s.Network = true
		}
		if s.PID == 0 {
			s.PID = l.pid
		}
		if s.Process == "" {
			s.Process = l.name
		}
	}
	out := make([]Service, 0, len(byPort))
	for _, s := range byPort {
		out = append(out, *s)
	}
	resolveProcessNames(out)
	return out
}

// reachableIP returns the loopback address to dial for a socket bound to ip.
func reachableIP(ip netip.Addr) (netip.Addr, bool) {
	switch {
	case ip.IsLoopback():
		return ip, true
	case ip.IsUnspecified():
		if ip.Is6() {
			return netip.IPv6Loopback(), true
		}
		return netip.AddrFrom4([4]byte{127, 0, 0, 1}), true
	default:
		return netip.Addr{}, false
	}
}

// resolveProcessNames fills Process for services whose enumerator only knew a
// pid, one lookup per distinct pid, concurrently (each is a syscall or a /proc
// read).
func resolveProcessNames(svcs []Service) {
	var pids []int
	for _, s := range svcs {
		if s.Process == "" && s.PID > 0 && !slices.Contains(pids, s.PID) {
			pids = append(pids, s.PID)
		}
	}
	if len(pids) == 0 {
		return
	}
	names := make([]string, len(pids)) // one slot per goroutine: no shared writes
	var wg sync.WaitGroup
	for i, pid := range pids {
		wg.Go(func() { names[i] = processName(pid) })
	}
	wg.Wait()
	for i := range svcs {
		if svcs[i].Process == "" {
			if j := slices.Index(pids, svcs[i].PID); j >= 0 {
				svcs[i].Process = names[j]
			}
		}
	}
}

// cleanProcess strips the directory and extension and lowercases, so
// "C:\Program Files\nodejs\node.exe" and "/usr/bin/node" both read "node".
func cleanProcess(name string) string {
	if i := strings.LastIndexAny(name, `/\`); i >= 0 {
		name = name[i+1:]
	}
	name = strings.TrimSuffix(strings.ToLower(name), ".exe")
	return strings.TrimSpace(name)
}

// devPortRank orders the ports popular dev servers default to first, so the
// suggestion list leads with the most likely target.
var devPortRank = map[int]int{
	3000: 0, 5173: 1, 8080: 2, 8000: 3, 4200: 4, 5000: 5, 3001: 6, 4000: 7,
	4321: 8, 8081: 9, 8888: 10, 9000: 11, 1313: 12, 5500: 13,
}

func portRank(p int) int {
	if r, ok := devPortRank[p]; ok {
		return r
	}
	return 100
}

// sortServices orders by kind, then popular dev ports, then port number.
func sortServices(s []Service) {
	slices.SortFunc(s, func(a, b Service) int {
		if d := a.Kind.rank() - b.Kind.rank(); d != 0 {
			return d
		}
		if d := portRank(a.Port) - portRank(b.Port); d != 0 {
			return d
		}
		return a.Port - b.Port
	})
}
