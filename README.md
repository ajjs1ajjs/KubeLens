<div align="center">

# 🛰️ KubeLens

**A modern, lightweight Kubernetes IDE.**

Built with **Tauri 2**, **Rust (kube-rs)** and **React**. A fast, focused
alternative to Lens: ~15 MB installer, ~40 MB RAM, no account, no telemetry,
real-time cluster views via the Kubernetes watch API.

[![CI](https://img.shields.io/github/actions/workflow/status/ajjs1ajjs/KubeLens/ci.yml?branch=main&label=CI&logo=github)](https://github.com/ajjs1ajjs/KubeLens/actions)
[![Release](https://img.shields.io/github/v/release/ajjs1ajjs/KubeLens?label=Release&logo=semver)](https://github.com/ajjs1ajjs/KubeLens/releases)
[![Rust](https://img.shields.io/badge/Rust-stable-blueviolet?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2-ffc131?logo=tauri)](https://tauri.app/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](#license)

</div>

---

## ✨ Features

| Feature                 | Description                                                        |
| ----------------------- | ------------------------------------------------------------------ |
| 🗂️ **Resource browser** | Pods, Deployments, Services, CRDs and more with live watch updates |
| 📋 **Logs**             | Stream pod logs, follow mode, per-container selection              |
| 💻 **Exec terminal**    | Interactive shell into any container (xterm.js)                    |
| 🔌 **Port-forward**     | Tunnel pod ports to localhost                                      |
| 📈 **Metrics**          | CPU / memory usage for nodes and pods in real time                 |
| 📦 **Helm**             | Browse and manage Helm releases (storage backend)                  |
| 🕸️ **Topology**         | Visual dependency graph of your workloads                          |
| ✍️ **YAML editor**      | View, edit and apply manifests with validation                     |

## Requirements

- Node.js 20+ and npm
- Rust (stable) with the MSVC toolchain on Windows (`x86_64-pc-windows-msvc`)
- On Windows: Visual Studio Build Tools with the "Desktop development with C++" workload

The project pins its Rust toolchain in `src-tauri/rust-toolchain.toml` and uses
`x86_64-pc-windows-msvc` on Windows.

## Development

```bash
npm install
npm run tauri dev
```

The frontend hot-reloads via Vite while the Rust backend compiles once.

## Scripts

| Command                 | Purpose                                |
| ----------------------- | -------------------------------------- |
| `npm run dev`           | Vite dev server only                   |
| `npm run build`         | Type-check + production frontend build |
| `npm run tauri dev`     | Run the desktop app in development     |
| `npm run tauri build`   | Build distributable bundles            |
| `npm run test`          | Frontend unit tests (Vitest)           |
| `npm run test:coverage` | Frontend tests with coverage           |
| `npm run lint`          | ESLint                                 |
| `npm run typecheck`     | TypeScript type-check                  |
| `npm run format`        | Prettier auto-format                   |
| `npm run check`         | Lint + format + typecheck + tests      |

Rust commands run inside `src-tauri/`:

```bash
cargo test        # Rust unit tests
cargo clippy      # Lints
cargo fmt         # Formatting
```

## Testing

Frontend and Rust unit tests do not need a cluster. The Rust backend also has
integration tests that spin up an in-process mock Kubernetes API server
(`src-tauri/src/k8s/mock_api.rs`) to exercise the full
client → list/watch/delete pipeline.

```bash
npm run check     # frontend: lint + format + typecheck + tests
cd src-tauri
cargo test        # Rust unit + integration tests
cargo clippy      # Lints
cargo fmt         # Formatting
```

## Local test cluster

A kind cluster helps manual testing:

```powershell
.\scripts\dev-cluster.ps1        # create
.\scripts\dev-cluster.ps1 -Delete # remove
```

Requires Docker and kind.

## CI

`.github/workflows/ci.yml` runs lint, format, type-check, frontend and Rust
tests on Windows and macOS, and produces installers (NSIS on Windows, DMG on
macOS) for every push to `main`.

## Releases

Releases are driven by version tags (`v*`). Pushing a tag builds the NSIS/DMG
installers and publishes them as a GitHub Release (draft):

```powershell
.\scripts\bump-version.ps1 1.2.3   # bump + commit + tag v1.2.3
git push origin main --tags         # triggers the Release workflow
```

`bump-version.ps1` keeps `Cargo.toml`, `tauri.conf.json` and `package.json` in
sync and creates the `v<version>` tag.

## License

<a id="license"></a>

Private project. All rights reserved.
