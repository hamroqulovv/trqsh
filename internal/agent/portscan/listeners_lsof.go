//go:build !windows && !linux

package portscan

import (
	"bufio"
	"bytes"
	"context"
	"net/netip"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// listeners asks lsof (shipped with macOS and the BSDs) for listening TCP
// sockets in its machine-readable -F format. One process spawn, ~30–80 ms.
func listeners(ctx context.Context) ([]listener, error) {
	ctx, cancel := context.WithTimeout(ctx, 1500*time.Millisecond)
	defer cancel()
	out, err := exec.CommandContext(ctx, "lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn").Output()
	if err != nil && len(out) == 0 {
		return nil, err
	}
	var ls []listener
	var pid int
	var name string
	sc := bufio.NewScanner(bytes.NewReader(out))
	for sc.Scan() {
		line := sc.Text()
		if len(line) < 2 {
			continue
		}
		switch line[0] {
		case 'p':
			pid, _ = strconv.Atoi(line[1:])
			name = ""
		case 'c':
			name = cleanProcess(strings.ReplaceAll(line[1:], `\x20`, " "))
		case 'n':
			if ip, port, ok := parseLsofAddr(line[1:]); ok {
				ls = append(ls, listener{ip: ip, port: port, pid: pid, name: name})
			}
		}
	}
	return ls, nil
}

// parseLsofAddr decodes "*:3000", "127.0.0.1:3000" and "[::1]:3000".
func parseLsofAddr(s string) (netip.Addr, int, bool) {
	i := strings.LastIndexByte(s, ':')
	if i < 0 {
		return netip.Addr{}, 0, false
	}
	port, err := strconv.Atoi(s[i+1:])
	if err != nil {
		return netip.Addr{}, 0, false
	}
	host := strings.Trim(s[:i], "[]")
	if host == "*" {
		return netip.IPv6Unspecified(), port, true // dual-stack wildcard
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}, 0, false
	}
	return ip, port, true
}

// lsof already reports the command, so there is nothing more to resolve.
func processName(int) string { return "" }
