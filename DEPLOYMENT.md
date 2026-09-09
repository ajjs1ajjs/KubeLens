# KubeLens Deployment Guide

## Prerequisites

- Windows 10/11 (x64), Linux (x64/AppImage/deb), macOS (Apple Silicon)
- Rust toolchain (MSVC on Windows, stable)
- Node.js 22+
- Tauri CLI 2.x

## Building from Source

### Development Build

```bash
# Install dependencies
npm ci

# Run development server (with hot reload)
npm run tauri dev

# Or run frontend only
npm run dev
```

### Production Build

```bash
# Build frontend
npm run build

# Build Tauri app (creates installer bundles)
npm run tauri build
```

Output bundles:

- Windows: `src-tauri/target/release/bundle/nsis/*.exe`
- Linux: `src-tauri/target/release/bundle/deb/*.deb` and `src-tauri/target/release/bundle/appimage/*.AppImage`
- macOS: `src-tauri/target/release/bundle/dmg/*.dmg`

## Configuration

### Tauri Configuration

Edit `src-tauri/tauri.conf.json` for:

- App identifier, version, name
- Window size/position
- CSP policy
- Bundle settings (targets, icons)
- Updater endpoints and public key

### Rust Toolchain

The Rust toolchain is pinned in `src-tauri/rust-toolchain.toml`:

```toml
[toolchain]
channel = "stable"
targets = ["x86_64-pc-windows-msvc"]  # Windows MSVC
```

### Frontend Configuration

Vite configuration in `vite.config.ts`:

- Base path (set to `/` for Tauri, `/KubeLens/` for GitHub Pages)
- Plugin configuration (React, Tailwind)
- Build output and chunk splitting

## Release Process

### Version Bumping

1. Update version in three files (must match):
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`

   Use the provided script:

   ```powershell
   # Windows PowerShell
   .\scripts\bump-version.ps1 0.3.11
   ```

2. Commit changes:

   ```bash
   git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
   git commit -m "chore: bump version to 0.3.11"
   ```

3. Create and push tag:
   ```bash
   git tag v0.3.11
   git push origin v0.3.11
   ```

### GitHub Actions Release Workflow

The release is automated via `.github/workflows/release.yml`:

1. Pushes a tag `v*` or manually triggers with a version
2. Builds on Windows, Ubuntu, and macOS
3. Signs artifacts with minisign private key (stored in `TAURI_SIGNING_PRIVATE_KEY` secret)
4. Creates GitHub Release with installers and `latest.json` for auto-updater

Required GitHub Secrets:

- `TAURI_SIGNING_PRIVATE_KEY`: Minisign private key for artifact signing
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Password for the key (if encrypted)
- `PUBLIC_RELEASE_TOKEN` (optional): GitHub token for release creation

### Generating Minisign Keys

```bash
# Install minisign
# Windows: scoop install minisign
# Linux: apt install minisign / brew install minisign

# Generate keypair
minisign -G

# This creates:
# - minisign.pub (public key - add to tauri.conf.json)
# - minisign.key (private key - add to GitHub Secrets as TAURI_SIGNING_PRIVATE_KEY)
```

## Auto-Updater

The app checks for updates on startup using the Tauri updater:

- Endpoint: `https://github.com/ajjs1ajjs/KubeLens/releases/latest/download/latest.json`
- Public key embedded in `tauri.conf.json`
- Downloads and installs updates in-place (no manual download needed)

## CI/CD Pipeline

### CI Workflow (`.github/workflows/ci.yml`)

Runs on every push/PR to main:

1. Frontend checks: lint, format, typecheck, tests, build
2. Rust checks: fmt, clippy, tests
3. Bundle build (on main branch only)

### Required Checks Before Merge

All CI checks must pass:

- `npm run check` (lint + format + typecheck + tests)
- `cargo fmt --check`
- `cargo clippy --all-targets -- -D warnings`
- `cargo test`

## Environment Variables

See `.env.example` for available environment variables.

## Troubleshooting

### Build Failures

1. **Rust toolchain issues**: Ensure MSVC toolchain on Windows (`rustup target add x86_64-pc-windows-msvc`)
2. **Node version**: Use Node 22+ (specified in CI)
3. **Cache issues**: Clear `node_modules` and `target` directories, rebuild

### Updater Issues

1. **Signature verification failed**: Ensure `TAURI_SIGNING_PRIVATE_KEY` matches the public key in `tauri.conf.json`
2. **No updates found**: Check `latest.json` exists at the updater endpoint
3. **Download fails**: Verify release assets are uploaded correctly

### Kubeconfig Issues

1. **Config not loading**: Ensure kubeconfig is in `~/.kube/config` or set `KUBECONFIG` env var
2. **Permission denied**: The app only reads kubeconfig files under `~/.kube/` or app config directory
3. **Context not found**: Verify the kubeconfig has valid contexts with cluster/user entries

## Security Considerations

- Kubeconfig tokens are kept in memory only, never persisted to disk by the app
- Path traversal protection: kubeconfig files must be under `~/.kube/` or app config directory
- Rate limiting on all mutating and interactive commands
- CSP headers configured to prevent XSS
- No secrets in code or config files

## Support

For issues, check:

1. GitHub Issues: https://github.com/ajjs1ajjs/KubeLens/issues
2. Logs: Enable debug logging with `RUST_LOG=debug`
3. Tauri documentation: https://tauri.app/
