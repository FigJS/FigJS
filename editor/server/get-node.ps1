# Downloads the current Node.js LTS into .runtime\node (nothing installed
# system-wide), checked against the published SHA-256 sums.
# NODE_MIRROR points at another copy of nodejs.org/dist.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runtime = Join-Path $root '.runtime'
$target = Join-Path $runtime 'node'
$mirror = if ($env:NODE_MIRROR) { $env:NODE_MIRROR.TrimEnd('/') } else { 'https://nodejs.org/dist' }
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }

$index = Invoke-RestMethod "$mirror/index.json" -UseBasicParsing
$release = $index | Where-Object { $_.lts -and $_.files -contains "win-$arch-zip" } | Select-Object -First 1
if (-not $release) { throw "No Node.js LTS build for Windows $arch was found." }

$version = $release.version
$file = "node-$version-win-$arch.zip"
$sums = [Text.Encoding]::ASCII.GetString((Invoke-WebRequest "$mirror/$version/SHASUMS256.txt" -UseBasicParsing).RawContentStream.ToArray())
$entry = ($sums -split "`n") | Where-Object { $_ -match ('\s' + [regex]::Escape($file) + '\s*$') } | Select-Object -First 1
if (-not $entry) { throw "$file is not listed in the release checksums." }
$expected = ($entry.Trim() -split '\s+')[0].ToUpperInvariant()

New-Item -ItemType Directory -Force $runtime | Out-Null
$zip = Join-Path $runtime $file
$unpack = Join-Path $runtime 'unpack'

Write-Host "  Downloading Node.js $version ($arch) ..."
Invoke-WebRequest "$mirror/$version/$file" -OutFile $zip -UseBasicParsing

$sha = [Security.Cryptography.SHA256]::Create()
$stream = [IO.File]::OpenRead($zip)
try { $actual = -join ($sha.ComputeHash($stream) | ForEach-Object { $_.ToString('X2') }) }
finally { $stream.Dispose() }
if ($actual -ne $expected) {
  Remove-Item $zip -Force
  throw 'The download does not match its published checksum.'
}

Write-Host '  Unpacking ...'
if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
New-Item -ItemType Directory $unpack | Out-Null
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
if (Test-Path $tar) { & $tar -xf $zip -C $unpack; if ($LASTEXITCODE) { throw 'Unpacking failed.' } }
else { Expand-Archive $zip $unpack }

if (Test-Path $target) { Remove-Item $target -Recurse -Force }
Move-Item (Get-ChildItem $unpack -Directory | Select-Object -First 1).FullName $target
Remove-Item $unpack -Recurse -Force
Remove-Item $zip -Force
Write-Host "  Node.js $version is ready."
