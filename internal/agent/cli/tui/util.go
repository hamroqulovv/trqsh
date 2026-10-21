package tui

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/x/ansi"
)

// normalizeAddr turns "3000" into "localhost:3000", leaving host:port as-is —
// the same rule the `trqsh http` CLI applies, so tunnels started in the TUI
// behave identically to ones started from the shell.
func normalizeAddr(a string) string {
	a = strings.TrimSpace(a)
	if i := strings.Index(a, "://"); i >= 0 {
		a = a[i+3:]
	}
	if _, _, err := net.SplitHostPort(a); err == nil {
		return a
	}
	return "localhost:" + a
}

// devPorts are the ports popular dev servers default to (Next/React, Vite,
// Angular, Django, Rails, Flask, Astro, Hugo, …), in the order suggested.
var devPorts = []int{3000, 5173, 8080, 8000, 4200, 5000, 3001, 4000, 4321, 8081, 8888, 9000, 1313, 5500}

// probeLocalPorts reports which devPorts accept a TCP connection on
// localhost, skipping skip (the daemon's own control port). "localhost"
// rather than 127.0.0.1 so servers bound only to ::1 (Vite on newer Node) are
// found too. All dials run at once, so the scan takes one timeout at most.
func probeLocalPorts(ctx context.Context, skip int) []int {
	open := make([]bool, len(devPorts))
	var wg sync.WaitGroup
	d := net.Dialer{Timeout: 300 * time.Millisecond}
	for i, p := range devPorts {
		if p == skip {
			continue
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			if c, err := d.DialContext(ctx, "tcp", net.JoinHostPort("localhost", strconv.Itoa(p))); err == nil {
				_ = c.Close()
				open[i] = true
			}
		}()
	}
	wg.Wait()
	var out []int
	for i, ok := range open {
		if ok {
			out = append(out, devPorts[i])
		}
	}
	return out
}

// trunc counts display cells, so Unicode paths and ANSI styles do not shift
// neighboring columns or cause an extra terminal line to wrap.
func trunc(s string, n int) string {
	if n <= 0 {
		return ""
	}
	return ansi.Truncate(s, n, "…")
}

// pad right-pads a label to n terminal cells without truncating it.
func pad(s string, n int) string {
	return s + strings.Repeat(" ", max(0, n-ansi.StringWidth(s)))
}

// shortID trims a tunnel id to its first 8 characters for compact display.
func shortID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

// humanBytes renders a byte count compactly (used by /whoami usage).
func humanBytes(n int64) string {
	const unit = 1024
	if n < unit {
		return fmt.Sprintf("%d B", n)
	}
	div, exp := int64(unit), 0
	for x := n / unit; x >= unit; x /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(n)/float64(div), "KMGTPE"[exp])
}
