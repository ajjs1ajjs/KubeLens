<div align="center">

# 🛰️ KubeLens

### A modern, lightweight Kubernetes IDE

Built with **Tauri 2**, **Rust (kube-rs)** and **React** — a fast, focused
alternative to Lens. **~15 MB installer · ~40 MB RAM · no account · no telemetry.**

[![CI](https://img.shields.io/github/actions/workflow/status/ajjs1ajjs/KubeLens/ci.yml?branch=main&label=CI&logo=github&style=for-the-badge)](https://github.com/ajjs1ajjs/KubeLens/actions)
[![Release](https://img.shields.io/github/v/release/ajjs1ajjs/KubeLens?label=Release&logo=semver&style=for-the-badge)](https://github.com/ajjs1ajjs/KubeLens/releases)
[![Rust](https://img.shields.io/badge/Rust-stable-blueviolet?logo=rust&style=for-the-badge)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&style=for-the-badge)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2-ffc131?logo=tauri&style=for-the-badge)](https://tauri.app/)

**Real-time cluster views via the Kubernetes watch API.**

</div>

---

## 📸 Screenshots

<sup>Screenshots coming soon.</sup>

```
┌─────────────────────────────────────────────────────────────┐
│  KubeLens — Pods / default                                  │
│  ┌──────────┬───────────┬────────┬────────┬───────┬────────┐ │
│  │ Name     │ Namespace │ Ready  │ Status │ CPU   │ Memory │ │
│  ├──────────┼───────────┼────────┼────────┼───────┼────────┤ │
│  │ web-0    │ default   │ 1/1    │ Running│ 125m  │ 64 Mi  │ │
│  │ db-0     │ default   │ 1/1    │ Running│ 60m   │ 32 Mi  │ │
│  └──────────┴───────────┴────────┴────────┴───────┴────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## ✨ Features

|                         |                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------- |
| 🗂️ **Resource browser** | Pods, Deployments, Services, CRDs, RBAC, Nodes and more — with live watch updates |
| 📋 **Logs**             | Stream pod logs, follow mode, per-container selection                             |
| 💻 **Exec terminal**    | Interactive shell into any container (xterm.js)                                   |
| 🔌 **Port-forward**     | Tunnel pod ports to localhost                                                     |
| 📈 **Metrics**          | CPU / memory usage for nodes and pods, with request & limit markers               |
| 📦 **Helm**             | Browse releases, inspect values/manifest/notes, diff revisions                    |
| 🕸️ **Topology**         | Visual dependency graph of your workloads, with drill-down                        |
| ✍️ **YAML editor**      | View, edit and apply manifests with validation                                    |
| 🔀 **Multi-cluster**    | Manage several kubeconfigs — rename, collapse, quick-switch                       |
| 🌐 **i18n**             | English and Ukrainian UI                                                          |
| 🔄 **Auto-update**      | In-app update notifications with one-click install                                |

## 🧱 Tech Stack

<div align="center">

**Desktop shell** &nbsp;·&nbsp; [Tauri 2](https://tauri.app/)
**Backend** &nbsp;·&nbsp; Rust · [kube-rs](https://kube.rs/) · Tokio · prost
**Frontend** &nbsp;·&nbsp; React 19 · TypeScript · Vite · Tailwind CSS 4 · shadcn/ui · TanStack Query & Table · xterm.js · CodeMirror

</div>

## 🚀 Getting Started

### Requirements

- **Node.js 20+** and npm
- **Rust** (stable) with the MSVC toolchain on Windows (`x86_64-pc-windows-msvc`)
- **Windows:** Visual Studio Build Tools — "Desktop development with C++" workload

> The project pins its Rust toolchain in `src-tauri/rust-toolchain.toml`.

### Development

```bash
npm install
npm run tauri dev
```

The frontend hot-reloads via Vite while the Rust backend compiles once.

## 📦 Scripts

| Command               | Purpose                                |
| --------------------- | -------------------------------------- |
| `npm run dev`         | Vite dev server only                   |
| `npm run build`       | Type-check + production frontend build |
| `npm run tauri dev`   | Run the desktop app in development     |
| `npm run tauri build` | Build distributable bundles            |
| `npm run test`        | Frontend unit tests (Vitest)           |
| `npm run lint`        | ESLint                                 |
| `npm run typecheck`   | TypeScript type-check                  |
| `npm run check`       | Lint + format + typecheck + tests      |

Rust commands run inside `src-tauri/`:

```bash
cargo test        # Rust unit tests
cargo clippy      # Lints
cargo fmt         # Formatting
```

## 🧪 Testing

Frontend and Rust unit tests don't need a cluster. The Rust backend also has
integration tests that spin up an in-process **mock Kubernetes API server**
(`src-tauri/src/k8s/mock_api.rs`) to exercise the full
client → list/watch/delete/apply pipeline.

```bash
npm run check     # frontend: lint + format + typecheck + tests
cd src-tauri && cargo test && cargo clippy && cargo fmt
```

## 📁 Project Structure

```text
src/                      # React frontend
├── app/                  # layout, routes, pages
├── features/             # clusters, resources, helm, topology, updates
├── components/ui/        # shadcn/ui primitives
├── i18n/                 # EN / UK locales
└── lib/k8s/              # API client, types, helpers

src-tauri/                # Rust backend (Tauri)
├── src/commands/         # IPC command handlers
├── src/k8s/              # cluster manager, resources, watch, helm, metrics, interactive
└── tauri.conf.json       # app config, CSP, updater
```

## 🧑‍💻 Local test cluster

A kind cluster helps manual testing:

```powershell
.\scripts\dev-cluster.ps1         # create
.\scripts\dev-cluster.ps1 -Delete # remove
```

Requires Docker and kind.

## 🚢 CI & Releases

`.github/workflows/ci.yml` runs lint, format, type-check, frontend and Rust tests
on Windows and macOS, and produces installers (NSIS on Windows, DMG on macOS).

Releases are driven by version tags (`v*`):

```powershell
.\scripts\bump-version.ps1 1.2.3   # bump + commit + tag v1.2.3
git push origin main --tags         # triggers the Release workflow
```

`bump-version.ps1` keeps `Cargo.toml`, `tauri.conf.json` and `package.json` in
sync and creates the `v<version>` tag.

---

<div align="center">

Made with ❤️ for the Kubernetes community.

</div>

## License

<a id="license"></a>

Private project. All rights reserved.
