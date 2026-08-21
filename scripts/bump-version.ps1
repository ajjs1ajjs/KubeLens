param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

# Bumps the KubeLens version across Cargo.toml, tauri.conf.json and package.json
# and tags it as v<Version>. Requires a clean working tree and that the version
# is a valid semver like 1.2.3.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not $Version -match '^\d+\.\d+\.\d+$') {
    throw "Version must be semver like 1.2.3, got: $Version"
}

function Set-VersionLine([string]$Path, [string]$Pattern) {
    $content = Get-Content $Path -Raw
    $newContent = [regex]::Replace($content, $Pattern, "`${1}`"$Version`"`${2}", 'Multiline')
    if ($newContent -eq $content) {
        throw "Failed to bump version in $Path - pattern did not match. File may have unexpected formatting."
    }
    Set-Content -Path $Path -Value $newContent -NoNewline
}

# --- Cargo.toml: version = "0.1.0" ---
Set-VersionLine (Join-Path $root "src-tauri\Cargo.toml") '^(version\s*=\s*)"[^"]*"(\s*)$'

# --- tauri.conf.json: "version": "0.1.0" ---
Set-VersionLine (Join-Path $root "src-tauri\tauri.conf.json") '^(\s*"version"\s*:\s*)"[^"]*"(\s*,?\s*)$'

# --- package.json: "version": "0.1.0" ---
Set-VersionLine (Join-Path $root "package.json") '^(\s*"version"\s*:\s*)"[^"]*"(\s*,?\s*)$'

# --- verify all three manifests are in sync ---
$pkgVer = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version
$tauriVer = (Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json).version
$cargoRaw = Get-Content (Join-Path $root "src-tauri\Cargo.toml") -Raw
if ($cargoRaw -notmatch '(?m)^version\s*=\s*"([^"]+)"') { throw "Could not parse Cargo.toml version" }
$cargoVer = $Matches[1]
foreach ($v in @($pkgVer, $tauriVer, $cargoVer)) {
    if ($v -ne $Version) { throw "Version mismatch after bump: expected $Version but got pkg=$pkgVer tauri=$tauriVer cargo=$cargoVer" }
}
Write-Host "Verified versions in sync: $Version"

# --- tag ---
$tag = "v$Version"
git add -A
git commit -m "chore: release $tag"
git tag $tag

Write-Host "Bumped version to $Version and tagged $tag"
Write-Host "Push with: git push origin main --tags"
