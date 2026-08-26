<div align="center">

<img src="public/app-icon.png" alt="KubeLens" width="96" />

# KubeLens

### A fast, focused Kubernetes desktop IDE

Explore workloads, logs, metrics, Helm releases and dependency topology from one lightweight desktop app.

[![CI](https://img.shields.io/github/actions/workflow/status/ajjs1ajjs/KubeLens/ci.yml?branch=main&label=CI&logo=github)](https://github.com/ajjs1ajjs/KubeLens/actions)
[![Release](https://img.shields.io/github/v/release/ajjs1ajjs/KubeLens?label=latest%20release&logo=semver)](https://github.com/ajjs1ajjs/KubeLens/releases)
[![License](https://img.shields.io/badge/license-proprietary-111827)](#license)
[![Rust](https://img.shields.io/badge/Rust-stable-111827?logo=rust)](https://www.rust-lang.org/)
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

Private project. All rights reserved.

<div align="center">

Made for a calmer Kubernetes workflow.

</div>
