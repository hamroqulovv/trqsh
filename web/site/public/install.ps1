# trqsh installer for Windows - downloads the release zip, verifies its SHA-256
# against checksums.txt, and installs trqsh.exe for the current user. Serve this
# at https://trqsh.uz/install.ps1:
#
#   irm https://trqsh.uz/install.ps1 | iex
#
# From cmd.exe:  powershell -c "irm https://trqsh.uz/install.ps1 | iex"
# Overrides: TRQSH_VERSION, TRQSH_REPO, TRQSH_BINDIR, TRQSH_NO_MODIFY_PATH=1.

& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest is very slow with a progress bar.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  function Say([string]$message) { Write-Host "  [ok] $message" }
  # throw, never exit: under `iex` exit would close the user's shell.
  function Die([string]$message) { throw "trqsh install: $message" }

  Write-Host "`n  trqsh / install`n  Localhost, online.`n"

  # CLI releases publish to their own dedicated repo (source stays in trqsh-tunnel/trqsh).
  $repo = if ($env:TRQSH_REPO) { $env:TRQSH_REPO } else { 'trqsh-tunnel/trqshcli' }

  $version = $env:TRQSH_VERSION
  if (-not $version) {
    try {
      $version = (Invoke-RestMethod -UseBasicParsing "https://api.github.com/repos/$repo/releases/latest").tag_name
    } catch {
      Die 'Could not resolve the latest release. Retry or set TRQSH_VERSION.'
    }
  }
  $version = "$version".TrimStart('v')
  if ($version -notmatch '^[0-9][0-9A-Za-z.+-]*$') { Die 'Invalid TRQSH_VERSION.' }

  # 32-bit PowerShell on 64-bit Windows reports x86; PROCESSOR_ARCHITEW6432 holds the real one.
  $cpu = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  $arch = switch ($cpu) {
    'AMD64' { 'amd64' }
    'ARM64' { 'arm64' }
    default { Die "unsupported architecture '$cpu' - see https://github.com/$repo/releases" }
  }

  Say "Platform  windows / $arch"
  Say "Release  v$version"
  $archive = "trqsh_${version}_windows_${arch}.zip"
  $base = if ($env:TRQSH_DOWNLOAD_BASE) { $env:TRQSH_DOWNLOAD_BASE } else { "https://github.com/$repo/releases/download/v$version" }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("trqsh-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    Write-Host "  [..] Downloading  $archive"
    try {
      Invoke-WebRequest -UseBasicParsing "$base/$archive" -OutFile (Join-Path $tmp $archive)
    } catch {
      Die 'Download failed. Retry installation.'
    }
    Say ("Downloaded  {0} bytes" -f (Get-Item (Join-Path $tmp $archive)).Length)

    if ($env:TRQSH_SKIP_CHECKSUM -eq '1') {
      Write-Host '  [!] Verification skipped  TRQSH_SKIP_CHECKSUM=1'
    } else {
      try {
        $sums = (Invoke-WebRequest -UseBasicParsing "$base/checksums.txt").Content
      } catch {
        Die 'Could not fetch checksums.txt.'
      }
      if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
      $want = $null
      foreach ($line in ($sums -split "`r?`n")) {
        $fields = $line.Trim() -split '\s+'
        if ($fields.Count -ge 2 -and $fields[1].TrimStart('*') -eq $archive) { $want = $fields[0].ToLowerInvariant(); break }
      }
      if (-not $want) { Die 'Archive missing from checksums.txt.' }
      $got = (Get-FileHash -Algorithm SHA256 (Join-Path $tmp $archive)).Hash.ToLowerInvariant()
      if ($want -ne $got) { Die "Checksum mismatch for $archive" }
      Say 'Verified  SHA-256'
    }

    Write-Host '  [..] Installing  Native CLI'
    $extracted = Join-Path $tmp 'x'
    Expand-Archive -Path (Join-Path $tmp $archive) -DestinationPath $extracted -Force
    $exe = Join-Path $extracted 'trqsh.exe'
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { Die 'trqsh.exe missing from archive' }
    $actual = & $exe --version
    if ($LASTEXITCODE -ne 0) { Die 'Downloaded binary could not run.' }
    $reported = $null
    foreach ($line in @($actual)) {
      $fields = "$line".Trim() -split '\s+'
      if ($fields.Count -ge 2 -and $fields[0] -eq 'trqsh') { $reported = $fields[1].TrimStart('v'); break }
    }
    if ($reported -ne $version) { Die 'Downloaded binary version does not match release.' }

    $bindir = if ($env:TRQSH_BINDIR) { $env:TRQSH_BINDIR } else { Join-Path $env:LOCALAPPDATA 'Programs\trqsh' }
    New-Item -ItemType Directory -Force -Path $bindir | Out-Null
    $target = Join-Path $bindir 'trqsh.exe'
    $staged = Join-Path $bindir ('.trqsh-install-' + [Guid]::NewGuid().ToString('N') + '.exe')
    Copy-Item -LiteralPath $exe -Destination $staged
    try {
      Move-Item -LiteralPath $staged -Destination $target -Force
    } catch {
      Remove-Item -LiteralPath $staged -Force -ErrorAction SilentlyContinue
      Die "Could not replace $target. Close any running trqsh and retry."
    }
    Say "installed to $target"

    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @("$userPath" -split ';' | Where-Object { $_ })
    if ($env:TRQSH_NO_MODIFY_PATH -eq '1') {
      if ($entries -notcontains $bindir) { Say "add $bindir to your PATH to run 'trqsh' from anywhere" }
    } elseif ($entries -notcontains $bindir) {
      [Environment]::SetEnvironmentVariable('Path', (($entries + $bindir) -join ';'), 'User')
      Say "added $bindir to your user PATH (open a new terminal)"
    }
    if (@($env:Path -split ';') -notcontains $bindir) { $env:Path = "$env:Path;$bindir" }
    Write-Host "`n  Installed successfully. Run: trqsh`n"
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
