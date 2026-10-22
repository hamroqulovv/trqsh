package tui

import (
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/trqsh-uz/trqsh/internal/agent"
	"github.com/trqsh-uz/trqsh/internal/agent/portscan"
)

func sampleScan() portscan.Result {
	return portscan.Result{
		Took: 12 * time.Millisecond,
		Services: []portscan.Service{
			{Port: 3000, Kind: portscan.KindWeb, App: "Next.js", Title: "Acme Dashboard", Process: "node", Scheme: "http", Status: 200},
			{Port: 5173, Kind: portscan.KindWeb, App: "Vite", Title: "trqsh site", Process: "node", Scheme: "http", Status: 200},
			{Port: 8000, Kind: portscan.KindAPI, App: "Django", Process: "python", Detail: "JSON", Network: true},
			{Port: 5432, Kind: portscan.KindDatabase, App: "PostgreSQL", Process: "postgres"},
			{Port: 135, Kind: portscan.KindSystem, App: "Windows RPC"},
		},
	}
}

func portsModel(t *testing.T, w, h int) model {
	t.Helper()
	m := newModel(Options{Addr: "127.0.0.1:4041"}, newClient("127.0.0.1:0", ""))
	m.dataLoaded, m.accountLoaded = true, true
	return feed(m, tea.WindowSizeMsg{Width: w, Height: h})
}

func TestScanResultFeedsSuggestionsAndWelcome(t *testing.T) {
	m := portsModel(t, 100, 30)
	m = feed(m, portsMsg{res: sampleScan()})

	if got := m.localPorts; len(got) != 3 || got[0] != 3000 || got[1] != 5173 || got[2] != 8000 {
		t.Fatalf("localPorts = %v, want the three HTTP servers in order", got)
	}
	txt := transcriptText(m)
	for _, want := range []string{"/http 3000", "Share Next.js · “Acme Dashboard”", "4 running on localhost"} {
		if !strings.Contains(txt, want) {
			t.Errorf("welcome missing %q:\n%s", want, txt)
		}
	}
	// The /http picker describes each port by what it is.
	m = typeStr(m, "/http ")
	if len(m.menuItems) == 0 || !strings.Contains(m.menuItems[0].desc, "Next.js") {
		t.Fatalf("menu = %+v, want described ports", m.menuItems)
	}
}

func TestPortsCommandPrintsCard(t *testing.T) {
	m := portsModel(t, 100, 30)
	m.tunnels = []agent.Tunnel{{ID: "t1", PublicURL: "https://x.trqsh.uz", LocalAddr: "localhost:5173"}}
	m.probing = true // the startup scan is still in flight: /ports waits for it
	m = typeStr(m, "/ports")
	m = feed(m, tea.KeyMsg{Type: tea.KeyEnter})
	if !m.reportPorts {
		t.Fatal("/ports should arm a report")
	}
	m = feed(m, portsMsg{res: sampleScan()})

	txt := transcriptText(m)
	for _, want := range []string{
		"localhost · 3 apps · 1 other",
		":3000", "Next.js", "“Acme Dashboard”",
		"↗ :5173", // already shared
		"lan",     // Django listens on every interface
		"PostgreSQL",
		"1 system service hidden",
		"scanned in 12 ms",
		"/http 3000", // first unshared app is the suggested next step
	} {
		if !strings.Contains(txt, want) {
			t.Errorf("card missing %q:\n%s", want, txt)
		}
	}
	if strings.Contains(txt, "Windows RPC") {
		t.Errorf("system services must be hidden by default:\n%s", txt)
	}
	if m.reportPorts {
		t.Error("report should be consumed")
	}

	// /ports all reveals them.
	m.probing = true
	m = typeStr(m, "/ports all")
	m = feed(m, tea.KeyMsg{Type: tea.KeyEnter})
	m = feed(m, portsMsg{res: sampleScan()})
	if !strings.Contains(transcriptText(m), "Windows RPC") {
		t.Errorf("/ports all should list system services:\n%s", transcriptText(m))
	}
}

func TestPortsEmptyState(t *testing.T) {
	m := portsModel(t, 80, 24)
	m.scan = portscan.Result{Took: 3 * time.Millisecond}
	got := strings.Join(m.portsLines(false), "\n")
	if !strings.Contains(got, "Nothing is running on localhost yet") || !strings.Contains(got, "3 ms") {
		t.Fatalf("empty state = %q", got)
	}
}

func TestPortsCardFitsNarrowTerminal(t *testing.T) {
	m := portsModel(t, 44, 20)
	m.scan = sampleScan()
	for _, line := range m.portsLines(false) {
		if w := lipgloss.Width(line); w > 44 {
			t.Errorf("line is %d cells wide (> 44): %q", w, line)
		}
	}
}

func TestFirstScanIsReportedOnce(t *testing.T) {
	m := portsModel(t, 100, 30)
	m = feed(m, portsMsg{res: sampleScan()})
	if n := strings.Count(transcriptText(m), "localhost · 3 apps"); n != 1 {
		t.Fatalf("startup scan card printed %d times, want 1", n)
	}
	// Later background re-scans (the /http picker) stay silent.
	m = feed(m, portsMsg{res: sampleScan()})
	if n := strings.Count(transcriptText(m), "localhost · 3 apps"); n != 1 {
		t.Fatalf("re-scan printed again (%d cards)", n)
	}
}

func TestEmptyFirstScanStaysQuiet(t *testing.T) {
	m := portsModel(t, 100, 30)
	m = feed(m, portsMsg{res: portscan.Result{Took: time.Millisecond}})
	if strings.Contains(transcriptText(m), "Nothing is running") {
		t.Fatal("an empty startup scan should not print a message")
	}
}
