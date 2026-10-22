//go:build linux

package portscan

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/hex"
	"net/netip"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// listeners parses /proc/net/tcp{,6} (state 0A = LISTEN) and then maps the
// socket inodes to owning processes by walking /proc/*/fd once. Everything is a
// file read; nothing is spawned.
func listeners(_ context.Context) ([]listener, error) {
	var out []listener
	inodes := map[uint64][]int{} // inode → indexes into out
	var firstErr error
	for _, f := range []string{"/proc/net/tcp", "/proc/net/tcp6"} {
		ls, ino, err := parseProcNet(f)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		for i, l := range ls {
			inodes[ino[i]] = append(inodes[ino[i]], len(out))
			out = append(out, l)
		}
	}
	if len(out) == 0 && firstErr != nil {
		return nil, firstErr
	}
	attachPIDs(out, inodes)
	return out, nil
}

func parseProcNet(path string) ([]listener, []uint64, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()
	var ls []listener
	var inodes []uint64
	sc := bufio.NewScanner(f)
	sc.Scan() // header
	for sc.Scan() {
		fs := strings.Fields(sc.Text())
		if len(fs) < 10 || fs[3] != "0A" {
			continue
		}
		ip, port, ok := parseProcAddr(fs[1])
		if !ok {
			continue
		}
		ino, _ := strconv.ParseUint(fs[9], 10, 64)
		ls = append(ls, listener{ip: ip, port: port})
		inodes = append(inodes, ino)
	}
	return ls, inodes, sc.Err()
}

// parseProcAddr decodes "0100007F:0BB8". Each 32-bit word of the address is
// printed in host (little-endian) order.
func parseProcAddr(s string) (netip.Addr, int, bool) {
	h, p, ok := strings.Cut(s, ":")
	if !ok {
		return netip.Addr{}, 0, false
	}
	b, err := hex.DecodeString(h)
	if err != nil || (len(b) != 4 && len(b) != 16) {
		return netip.Addr{}, 0, false
	}
	for i := 0; i+4 <= len(b); i += 4 {
		binary.BigEndian.PutUint32(b[i:], binary.LittleEndian.Uint32(b[i:]))
	}
	port, err := strconv.ParseUint(p, 16, 16)
	if err != nil {
		return netip.Addr{}, 0, false
	}
	ip, _ := netip.AddrFromSlice(b)
	return ip, int(port), true
}

// attachPIDs fills pid for each listener by finding which process holds its
// socket inode. Processes we can't read (other users') are simply skipped.
func attachPIDs(out []listener, inodes map[uint64][]int) {
	fds, _ := filepath.Glob("/proc/[0-9]*/fd/*")
	remaining := len(inodes)
	for _, fd := range fds {
		if remaining == 0 {
			return
		}
		link, err := os.Readlink(fd)
		if err != nil || !strings.HasPrefix(link, "socket:[") {
			continue
		}
		ino, err := strconv.ParseUint(strings.TrimSuffix(strings.TrimPrefix(link, "socket:["), "]"), 10, 64)
		if err != nil {
			continue
		}
		idxs, ok := inodes[ino]
		if !ok {
			continue
		}
		pid, _ := strconv.Atoi(strings.Split(fd, "/")[2])
		for _, i := range idxs {
			out[i].pid = pid
		}
		delete(inodes, ino)
		remaining--
	}
}

// processName reads /proc/<pid>/comm (the executable name, ≤15 chars).
func processName(pid int) string {
	b, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/comm")
	if err != nil {
		return ""
	}
	return cleanProcess(strings.TrimSpace(string(b)))
}
