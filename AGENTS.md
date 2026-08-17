# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

KubeLens — a Tauri 2 + Rust (kube-rs) + React 19 desktop Kubernetes IDE.

- Frontend: `src/` (React + TypeScript + Vite + Tailwind CSS 4 + shadcn/ui)
- Backend: `src-tauri/` (Rust, kube-rs, tokio)
- Tests: Vitest (frontend), cargo test (backend)
- Lint/format: ESLint flat config + Prettier (frontend), cargo clippy + rustfmt (backend)

## Commands

Run from repo root unless noted:

- `npm run dev` — Vite dev server (use `npm run tauri dev` for the app)
- `npm run tauri dev` — run desktop app with hot reload
- `npm run check` — lint + format:check + typecheck + frontend tests (do this before finishing)
- `npm run build` — frontend production build
- `npm run tauri build` — full app bundles (NSIS/DMG)
- `cargo test` / `cargo clippy` / `cargo fmt` — run inside `src-tauri/`
- `.\scripts\dev-cluster.ps1` — local kind cluster for manual testing

## Toolchain

- Windows Rust must use the MSVC target. Pinned in `src-tauri/rust-toolchain.toml`.
  Do not change this to GNU.
- Node 22+.

## Conventions

- Frontend code lives under `src/features/<name>/` with components, hooks and
  tests colocated.
- shadcn/ui components go in `src/components/ui/` (generated, edit sparingly).
- All Tauri commands live in `src-tauri/src/commands/`; Kubernetes logic in
  `src-tauri/src/k8s/`.
- Path alias `@/` maps to `src/`.
- Never commit secrets. kubeconfig tokens must never be logged or stored to
  disk; keep them in memory only.
- No comments unless they explain non-obvious decisions.

## Testing

Every phase ships with tests. Frontend: colocate `*.test.ts(x)`. Backend:
`#[cfg(test)]` modules next to the code.
