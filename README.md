# KubeLens

A modern, lightweight Kubernetes IDE. Built with Tauri 2, Rust (kube-rs) and React.

The goal is a fast, focused alternative to Lens: ~15 MB installer, ~40 MB RAM,
no account, no telemetry, real-time cluster views via the Kubernetes watch API.

## Status

Phase 6 (dependency topology graph) is done:

- Pure graph builder (`src/features/topology/topology.ts`) that links Ingress →
  Service (backend refs), Service → Workload (label selector match), and
  Workload → ConfigMap/Secret/PVC (env/envFrom/volumes refs), then lays the
  graph out in kind columns. Fully unit-tested.
- New "Topology" page (sidebar → Tools) rendering the graph as a lightweight
  hand-rolled SVG with zoom/refresh, node selection and empty/error states.
  Fetches all graph-relevant kinds in parallel via the existing resource API.
- No graph library added — keeps the app lightweight.

Phase 5 (Helm releases) is done:

- Backend: `list_helm_releases` / `get_helm_release` / `uninstall_helm_release`
  reading the Helm 3 storage backend (release Secrets) — no `helm` binary or
  Tiller needed. Payloads are decoded as base64 → gzip → protobuf, including
  chart metadata, values, manifest and notes. Covered by unit tests plus
  integration tests against the mock API server (which now honours label
  selectors for the secret list).
- Frontend: new "Helm Releases" page (sidebar → Tools) listing installed
  releases with status, chart, revision and age, a detail drawer with
  Values / Manifest / Notes tabs, and uninstall with confirmation.

Phase 4 (CPU/RAM usage metrics) is done:

- Backend: `get_pod_metrics` / `get_node_metrics` commands reading the
  metrics-server API (`metrics.k8s.io/v1beta1`), with a quantity parser
  (millicores/bytes, binary+decimal suffixes). Pod and node metrics lists are
  covered by integration tests against the mock API server.
- Frontend: Pods and Nodes tables show live CPU/Memory columns; the Pod detail
  drawer gained a Metrics tab with per-container usage bars. Metrics poll
  every 15s. Graceful empty state when metrics-server is not installed.

Phase 3 (pod logs, exec terminal, port-forward) is done:

- Backend: `get_logs`/`follow_logs`/`stop_follow_logs` (streams log lines over
  a Tauri event), `exec_shell`/`exec_input`/`stop_exec` (interactive terminal
  with stdin/stdout/stderr proxied over the kube exec API), and
  `start_port_forward`/`stop_port_forward`/`list_port_forwards` (localhost
  tunnels proxying to a pod port). Log streaming is covered by integration
  tests against the mock API server; exec/port-forward error paths are tested
  (the mock cannot speak websockets).
- Frontend: pod detail drawer gained Logs and Terminal tabs plus a Port
  Forward dialog. Logs support container selection, refresh and live
  follow. The terminal renders with xterm.js and forwards keystrokes to the
  pod; tunnels list and stop from a dialog with toast feedback.

Phase 2 (YAML editor and resource actions) is done:

- Backend: `apply_yaml` command using server-side apply (`kubectl apply`
  semantics — creates or merges), YAML parsing/validation, covered by
  integration tests against the in-process mock API server
- Frontend: CodeMirror-based YAML editor, "Create" from a manifest template,
  inline Edit (pre-filled with the current object) and Delete with
  confirmation, toast feedback, live table refresh after mutations
- Phase 1 (core resource browser) is done:

  - Rust backend (`kube-rs`): multi-context kubeconfig loading/merging, dynamic
    API for any resource kind (list/get/delete/apply), live watches via the
    Kubernetes watch API streamed to the frontend over a Tauri event
  - React frontend: overview with cluster cards, namespaced resource tables
    (workloads, networking, config, RBAC, CRDs, nodes) with live updates,
    cluster and namespace switchers, resource detail drawer
  - The kube → watch pipeline is tested end-to-end against an in-process mock
    Kubernetes API server (no Docker or cluster required): see
    `src-tauri/src/k8s/mock_api.rs` and the integration tests in
    `src-tauri/src/k8s/watch.rs` and `src-tauri/src/k8s/resources.rs`

Planned next:

- CPU/RAM metrics charts for resource requests/limits
- Release diffing / resource dependency drill-down from the topology

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

Private project. All rights reserved.
