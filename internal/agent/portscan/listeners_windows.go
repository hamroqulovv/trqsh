//go:build windows

package portscan

import (
	"context"
	"encoding/binary"
	"fmt"
	"net/netip"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	iphlpapi            = windows.NewLazySystemDLL("iphlpapi.dll")
	procGetExtendedTcp  = iphlpapi.NewProc("GetExtendedTcpTable")
	tcpTableOwnerPIDLis = uintptr(3) // TCP_TABLE_OWNER_PID_LISTENER
)

// listeners reads the kernel's listening-socket table with one call per
// address family — no process spawn, no port guessing. This is why the whole
// scan is fast on Windows.
func listeners(_ context.Context) ([]listener, error) {
	var out []listener
	for _, fam := range []struct {
		af      uintptr
		rowSize int
	}{{windows.AF_INET, 24}, {windows.AF_INET6, 56}} {
		rows, err := tcpTable(fam.af)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			if len(row) < fam.rowSize {
				continue
			}
			if fam.af == windows.AF_INET {
				out = append(out, listener{
					ip:   netip.AddrFrom4([4]byte(row[4:8])),
					port: netPort(binary.LittleEndian.Uint32(row[8:12])),
					pid:  int(binary.LittleEndian.Uint32(row[20:24])),
				})
			} else {
				out = append(out, listener{
					ip:   netip.AddrFrom16([16]byte(row[0:16])),
					port: netPort(binary.LittleEndian.Uint32(row[20:24])),
					pid:  int(binary.LittleEndian.Uint32(row[52:56])),
				})
			}
		}
	}
	return out, nil
}

// tcpTable returns the raw MIB_TCPROW_OWNER_PID(6) rows for one family. The
// DWORD fields are little-endian; addresses and ports are in network order.
func tcpTable(af uintptr) ([][]byte, error) {
	rowSize := 24
	if af == windows.AF_INET6 {
		rowSize = 56
	}
	size := uint32(16 << 10)
	for range 4 { // the table can grow between the sizing call and the read
		buf := make([]byte, size)
		r, _, _ := procGetExtendedTcp.Call(
			uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)),
			0, af, tcpTableOwnerPIDLis, 0)
		switch syscall.Errno(r) {
		case 0:
			n := int(binary.LittleEndian.Uint32(buf[0:4]))
			rows := make([][]byte, 0, n)
			for i := 0; i < n && 4+(i+1)*rowSize <= len(buf); i++ {
				rows = append(rows, buf[4+i*rowSize:4+(i+1)*rowSize])
			}
			return rows, nil
		case windows.ERROR_INSUFFICIENT_BUFFER:
			continue // size was updated by the call
		default:
			return nil, fmt.Errorf("GetExtendedTcpTable: %w", syscall.Errno(r))
		}
	}
	return nil, fmt.Errorf("GetExtendedTcpTable: table kept growing")
}

// netPort converts the table's network-order port DWORD to a number.
func netPort(v uint32) int { return int(v&0xff)<<8 | int(v>>8&0xff) }

// processName returns the executable name for pid ("node"), or "" when the
// process is protected or gone.
func processName(pid int) string {
	if pid == 4 {
		return "system"
	}
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return ""
	}
	defer windows.CloseHandle(h)
	buf := make([]uint16, windows.MAX_PATH)
	n := uint32(len(buf))
	if err := windows.QueryFullProcessImageName(h, 0, &buf[0], &n); err != nil {
		return ""
	}
	return cleanProcess(windows.UTF16ToString(buf[:n]))
}
