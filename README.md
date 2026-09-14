<div align="center">

<img src="public/app-icon.png" alt="KubeLens" width="96" />

# KubeLens — Source Code

[![Deployed to](https://img.shields.io/badge/Deployed_to-KubeLens-blue)](https://github.com/ajjs1ajjs/KubeLens)
[![Website](https://img.shields.io/badge/Website-ajjs1ajjs.github.io%2FKubeLens-green)](https://ajjs1ajjs.github.io/KubeLens/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Це репозиторій з вихідним кодом KubeLens Kubernetes IDE.**
> Готовий продукт деплоїться в: **https://github.com/ajjs1ajjs/KubeLens**
> Офіційний сайт: **https://ajjs1ajjs.github.io/KubeLens/**

# KubeLens

### A fast, focused Kubernetes desktop IDE

Explore workloads, logs, metrics, Helm releases and dependency topology from one lightweight desktop app.

[![CI](https://img.shields.io/github/actions/workflow/status/ajjs1ajjs/KubeLens/ci.yml?branch=main&label=CI&logo=github)](https://github.com/ajjs1ajjs/KubeLens/actions)
[![Release](https://img.shields.io/github/v/release/ajjs1ajjs/KubeLens?label=latest%20release&logo=semver)](https://github.com/ajjs1ajjs/KubeLens/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-111827)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-0078D4)](https://github.com/ajjs1ajjs/KubeLens/releases)
[![React](https://img.shields.io/badge/React-19-20232a?logo=react)](https://react.dev/)
[![Tauri](https://img.shields.io/badge/Tauri-2-24c8db?logo=tauri)](https://tauri.app/)

</div>

## Overview

KubeLens is a modern Kubernetes IDE for developers and platform engineers who want a clear local desktop workflow without a heavy browser-based control plane.

- Lightweight desktop application built with Tauri 2
- Real-time resource updates through the Kubernetes watch API
- No account and no telemetry
- Multi-cluster kubeconfig management with quick switching
- English and Ukrainian interface

## Features

| Area       | What you can do                                                |
| ---------- | -------------------------------------------------------------- |
| Workloads  | Browse Pods, Deployments, Services, CRDs, RBAC, Nodes and more |
| Logs       | Stream pod logs with follow mode and container selection       |
| Terminal   | Open an interactive shell in any container                     |
| Networking | Forward pod ports to localhost                                 |
| Metrics    | Inspect CPU and memory usage for nodes and pods                |
| Helm       | Browse releases, values, manifests, notes and revisions        |
| Topology   | Explore workload dependencies with drill-down navigation       |
| YAML       | View, edit and apply Kubernetes manifests with validation      |
| Clusters   | Manage multiple kubeconfigs, rename entries and switch quickly |
| Updates    | Receive in-app update notifications and install new versions   |

## Tech stack

- **Desktop:** Tauri 2
- **Backend:** Rust, kube-rs, Tokio, prost
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui
- **Data and UI:** TanStack Query, TanStack Table, xterm.js, CodeMirror

## Getting started

### Requirements

- Node.js 22+ and npm
- Rust stable with the MSVC toolchain on Windows
- Visual Studio Build Tools with the **Desktop development with C++** workload on Windows

The repository pins the Rust toolchain in [`src-tauri/rust-toolchain.toml`](src-tauri/rust-toolchain.toml).

---

### Windows

#### System requirements

- Windows 10 or later (64-bit)
- Node.js 22+ ([download](https://nodejs.org/))
- Visual Studio Build Tools with the **Desktop development with C++** workload
  - Install via: `winget install Microsoft.VisualStudio.2022.BuildTools`
  - Or download from [visualstudio.microsoft.com](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
- Rust stable with MSVC toolchain (installed automatically by rustup)

#### Install

```powershell
# 1. Install Node.js 22+ from https://nodejs.org/

# 2. Install Visual Studio Build Tools with C++ workload
winget install Microsoft.VisualStudio.2022.BuildTools

# 3. Clone and install dependencies
git clone https://github.com/ajjs1ajjs/KubeLens.git
cd KubeLens
npm install
```

#### Run

```powershell
npm run tauri dev
```

#### Verify

```powershell
npm run tauri dev
# App window should open; check Help > About for version and "windows" platform
```

---

### macOS Apple Silicon

#### System requirements

- macOS 11.0 (Big Sur) or later
- Apple Silicon: M1, M2, M3, M4 or newer (ARM64 / aarch64)
- Xcode Command Line Tools
- Node.js 22+ ([download](https://nodejs.org/))

#### Install

```bash
# 1. Install Xcode Command Line Tools
xcode-select --install

# 2. Install Node.js 22+ from https://nodejs.org/ or via Homebrew
brew install node@22

# 3. Clone and install dependencies
git clone https://github.com/ajjs1ajjs/KubeLens.git
cd KubeLens
npm install
```

#### Run

```bash
npm run tauri dev
```

#### Verify

```bash
npm run tauri dev
# App window should open; check Help > About for version and "macos" platform
# Runs natively on ARM64 — no Rosetta 2 required
```

---

### Run locally

```bash
npm install
npm run tauri dev
```

To run only the frontend:

```bash
npm run dev
```

## Development commands

| Command               | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `npm run build`       | Type-check and build the frontend               |
| `npm run tauri build` | Build distributable desktop bundles             |
| `npm run test`        | Run frontend unit tests                         |
| `npm run lint`        | Run ESLint                                      |
| `npm run typecheck`   | Run the TypeScript checker                      |
| `npm run check`       | Run version, lint, format, type and test checks |
| `cargo test`          | Run Rust tests from `src-tauri/`                |
| `cargo clippy`        | Run Rust lints from `src-tauri/`                |

## Local Kubernetes cluster

For manual testing, create a local [kind](https://kind.sigs.k8s.io/) cluster:

```powershell
.\scripts\dev-cluster.ps1
.\scripts\dev-cluster.ps1 -Delete
```

Docker and kind are required.

## Project structure

```text
src/                     React frontend
├── app/                 Layout, routes and pages
├── features/            Clusters, resources, Helm, topology and updates
├── components/ui/       Shared UI primitives
├── i18n/                English and Ukrainian locales
└── lib/k8s/             API client, types and helpers

src-tauri/               Rust backend
├── src/commands/        Tauri IPC command handlers
├── src/k8s/             Kubernetes clients and resource operations
└── tauri.conf.json      Desktop configuration and updater settings
```

## Testing

Frontend tests do not require a live cluster. The Rust backend also includes an in-process mock Kubernetes API server.

```bash
npm run check
cd src-tauri && cargo test && cargo clippy
```

## Releases

Releases are created from version tags:

```powershell
.\scripts\bump-version.ps1 1.2.3
git push origin main --tags
```

The version is kept in sync across `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.

## License

MIT — see [LICENSE](LICENSE) for details.

<div align="center">

Made for a calmer Kubernetes workflow.

</div>
