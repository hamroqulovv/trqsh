package portscan

// What a listener is, decided before any connection is made: from the owning
// process and the port number. This keeps databases and OS services from ever
// being sent an HTTP request, and lets the final list hide the background noise
// every desktop accumulates.

type known struct {
	app  string
	kind Kind
}

// noProbe are services we identify but never speak to. Sending HTTP to a
// database or SSH daemon at best logs a protocol error on their side.
var knownProcesses = map[string]known{
	// databases, caches, brokers
	"postgres":      {"PostgreSQL", KindDatabase},
	"mysqld":        {"MySQL", KindDatabase},
	"mariadbd":      {"MariaDB", KindDatabase},
	"mongod":        {"MongoDB", KindDatabase},
	"redis-server":  {"Redis", KindDatabase},
	"valkey-server": {"Valkey", KindDatabase},
	"memcached":     {"Memcached", KindDatabase},
	"sqlservr":      {"SQL Server", KindDatabase},
	"clickhouse":    {"ClickHouse", KindDatabase},
	"cockroach":     {"CockroachDB", KindDatabase},
	"beam.smp":      {"RabbitMQ / Erlang", KindDatabase},
	"nats-server":   {"NATS", KindDatabase},

	// OS services and remote access
	"sshd":          {"SSH", KindSystem},
	"system":        {"Windows", KindSystem},
	"svchost":       {"Windows service", KindSystem},
	"lsass":         {"Windows", KindSystem},
	"services":      {"Windows", KindSystem},
	"wininit":       {"Windows", KindSystem},
	"spoolsv":       {"Print spooler", KindSystem},
	"msmpeng":       {"Defender", KindSystem},
	"systemd":       {"systemd", KindSystem},
	"cupsd":         {"CUPS", KindSystem},
	"avahi-daemon":  {"Avahi", KindSystem},
	"launchd":       {"macOS", KindSystem},
	"rapportd":      {"macOS", KindSystem},
	"controlcenter": {"macOS AirPlay", KindSystem},
	"controlce":     {"macOS AirPlay", KindSystem},

	// trqsh itself
	"trqsh":  {"trqsh", KindSystem},
	"trqshd": {"trqsh", KindSystem},

	// desktop apps that open a local helper port
	"spotify":         {"Spotify", KindSystem},
	"discord":         {"Discord", KindSystem},
	"steam":           {"Steam", KindSystem},
	"steamwebhelper":  {"Steam", KindSystem},
	"slack":           {"Slack", KindSystem},
	"teams":           {"Teams", KindSystem},
	"ms-teams":        {"Teams", KindSystem},
	"onedrive":        {"OneDrive", KindSystem},
	"dropbox":         {"Dropbox", KindSystem},
	"code":            {"VS Code", KindSystem},
	"code - insiders": {"VS Code", KindSystem},
	"cursor":          {"Cursor", KindSystem},
	"chrome":          {"Chrome", KindSystem},
	"msedge":          {"Edge", KindSystem},
	"firefox":         {"Firefox", KindSystem},
	"brave":           {"Brave", KindSystem},
	"claude":          {"Claude", KindSystem},
	"idea64":          {"JetBrains IDE", KindSystem},
	"webstorm64":      {"JetBrains IDE", KindSystem},
	"pycharm64":       {"JetBrains IDE", KindSystem},
	"goland64":        {"JetBrains IDE", KindSystem},
	"phpstorm64":      {"JetBrains IDE", KindSystem},
	"rider64":         {"JetBrains IDE", KindSystem},
	"clion64":         {"JetBrains IDE", KindSystem},
}

// portNames are well-known non-HTTP ports. The service is named from the port
// only when the process wasn't recognised, and is never probed.
var portNames = map[int]known{
	21:    {"FTP", KindSystem},
	22:    {"SSH", KindSystem},
	25:    {"SMTP", KindSystem},
	53:    {"DNS", KindSystem},
	2179:  {"Hyper-V", KindSystem},
	5040:  {"Windows service", KindSystem},
	7680:  {"Windows Update", KindSystem},
	110:   {"POP3", KindSystem},
	135:   {"Windows RPC", KindSystem},
	139:   {"NetBIOS", KindSystem},
	143:   {"IMAP", KindSystem},
	445:   {"SMB", KindSystem},
	1433:  {"SQL Server", KindDatabase},
	2181:  {"ZooKeeper", KindDatabase},
	3306:  {"MySQL", KindDatabase},
	3389:  {"Remote Desktop", KindSystem},
	5432:  {"PostgreSQL", KindDatabase},
	5672:  {"RabbitMQ", KindDatabase},
	5900:  {"VNC", KindSystem},
	6379:  {"Redis", KindDatabase},
	9092:  {"Kafka", KindDatabase},
	11211: {"Memcached", KindDatabase},
	27017: {"MongoDB", KindDatabase},
}

// classify applies the process and port tables. It reports whether the service
// was settled without a probe (databases, OS services); anything else still
// needs probing to find out what it is.
func classify(s *Service) (settled bool) {
	if k, ok := knownProcesses[s.Process]; ok {
		s.App, s.Kind = k.app, k.kind
		return true
	}
	if k, ok := portNames[s.Port]; ok {
		s.App, s.Kind = k.app, k.kind
		return true
	}
	// Windows hands out dynamic RPC endpoints from 49152 up to services we
	// couldn't name (access denied): not something a developer started.
	if s.Process == "" && s.PID > 0 && s.Port >= 49152 {
		s.Kind = KindSystem
		return true
	}
	s.Kind = KindTCP
	return false
}

// runtimeNames labels the language runtime behind a process, used when the
// response gives no better hint.
var runtimeNames = map[string]string{
	"node": "Node.js", "nodejs": "Node.js", "bun": "Bun", "deno": "Deno",
	"python": "Python", "python3": "Python", "pythonw": "Python", "uvicorn": "Uvicorn", "gunicorn": "Gunicorn",
	"java": "Java", "javaw": "Java", "dotnet": ".NET",
	"ruby": "Ruby", "php": "PHP", "php-cgi": "PHP", "php-fpm": "PHP", "go": "Go",
	"nginx": "nginx", "httpd": "Apache", "apache2": "Apache", "caddy": "Caddy", "traefik": "Traefik",
	"docker-proxy": "Docker", "com.docker.backend": "Docker", "wslrelay": "WSL",
	"ollama": "Ollama", "jupyter-lab": "Jupyter", "hugo": "Hugo",
}
