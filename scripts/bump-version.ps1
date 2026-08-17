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
    $content = [regex]::Replace($content, $Pattern, "`${1}`"$Version`"`${2}", 'Multiline')
    Set-Content -Path $Path -Value $content -NoNewline
}

# --- Cargo.toml: version = "0.1.0" ---
Set-VersionLine (Join-Path $root "src-tauri\Cargo.toml") '^(version\s*=\s*)"[^"]*"(\s*)$'

# --- tauri.conf.json: "version": "0.1.0" ---
Set-VersionLine (Join-Path $root "src-tauri\tauri.conf.json") '^(\s*"version"\s*:\s*)"[^"]*"(\s*,?\s*)$'

# --- package.json: "version": "0.1.0" ---
Set-VersionLine (Join-Path $root "package.json") '^(\s*"version"\s*:\s*)"[^"]*"(\s*,?\s*)$'

# --- tag ---
$tag = "v$Version"
git add -A
git commit -m "chore: release $tag"
git tag $tag

Write-Host "Bumped version to $Version and tagged $tag"
Write-Host "Push with: git push origin main --tags"
