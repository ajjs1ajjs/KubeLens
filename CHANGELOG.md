# Changelog

## v0.3.0

- **Lens-style Pod table:** new columns Restarts, Controlled By, Node, QoS alongside the existing Name, Namespace, Ready, Status, CPU, Memory, Age. QoS is color-coded (Guaranteed/Burstable/BestEffort).
- **Lens-style row actions menu:** the trailing `⋯` icon on every row opens a context menu with kind-aware actions: View YAML / Edit / Delete for everything; **Logs**, **Exec**, **Port Forward** for Pod; **Scale** for Deployment/StatefulSet/ReplicaSet; **Restart** for Deployment/StatefulSet/DaemonSet/CronJob.
- **Side-panel YAML editor:** create, edit and view manifests now live in a right-side Sheet (wider than the previous modal) with a Reset button and a dedicated read-only view mode.
- **New Tauri commands:** `scale_resource` (PATCH `/spec/replicas`) and `restart_resource` (PATCH `kubectl.kubernetes.io/restartedAt` annotation). Negative replica counts are rejected.

## v0.2.12

- **Release pipeline fixed:** the v0.2.12 release workflow no longer hard-fails when the `TAURI_SIGNING_PRIVATE_KEY` GitHub Secret cannot be decoded by the Tauri CLI. The build now disables `createUpdaterArtifacts`, signs the installer manually with `tauri signer sign`, and falls back to an unsigned `latest.json` with a clear warning if signing fails. This allows the installer to ship while the in-app updater is regenerated.
- **Topology graph fixed:** `useTopology` now uses `Promise.allSettled` so a single failing `listResources` call (e.g. RBAC denial on a custom resource or a missing CRD) no longer blanks the entire graph.
- **Pod terminal fixed:** `ResourceDetail` now memoizes the per-pod resource context, so the exec session is no longer torn down and restarted on every render. Pods accessed from the sidebar now connect to the terminal as expected.
- **Security:** Tauri signing keys (`privkey.txt`, `pubkey.txt`) are now in `.gitignore` to prevent accidental commit of the private key. `bump-version.ps1` now stages only the three version manifests explicitly (no more `git add -A`).

## v0.2.11

- **Signing key configured:** згенеровано нову Ed25519 пару ключів для підпису. `pubkey` оновлено в `tauri.conf.json`. Для підпису релізів потрібно додати `TAURI_SIGNING_PRIVATE_KEY` в GitHub Actions secrets.

## v0.2.9

- **Updater manifest fix:** `latest.json` тепер використовує поле `url` замість `tauri` — Tauri updater plugin вимагає саме `url` для поля з URL інсталятора.

## v0.2.8

- **Updater endpoint fixed:** `tauri.conf.json` endpoint змінено з `{{target}}.json` на `latest.json`. GitHub Pages workflow тепер генерує чистий `latest.json` з одним ключем `windows-x86_64` та SHA256 checksum. Release workflow вимкнено `createUpdaterArtifacts` (раніше `tauri-action` генерував маніфест з дублікатними ключами `windows-x86_64` + `windows-x86_64-nsis`, що ламало парсинг у Tauri updater plugin).
- **Error handling improved:** `use-update.ts` тепер не замовчує HTTP 404/not-found помилки, дозволяючи коректне відображення стану " немає оновлень".

## v0.2.6

- **GitHub Pages deploy fixed:** `pages.yml` тепер збирає фронтенд (`npm ci && npm run build`) і публікує лише `dist/` замість всього репозиторію (раніше у публічний доступ потрапляли `.git`, `node_modules`, вихідний код та service-токен метадані).
- **Валідація шляху kubeconfig:** `add_cluster_config` перевіряє, що файл існує та є звичайним файлом; шлях канонізується (resolved symlinks) перед збереженням, що прибирає дублікати при додаванні через різні представлення одного файлу.
- Додано `LICENSE` (MIT) — README-бейджі та посилання тепер валідні.
- README: прибрано порожній `href=""` на Platform-бейджі та нерелевантний Rust-бейдж.

## v0.2.5

- Поточний стабільний реліз Windows (NSIS) з оновленим CI та auto-release.

## v0.2.2

- **Виправлено Windows-збірку:** повернуто `bundle.targets = ["nsis"]` у `tauri.conf.json` (у v0.2.2/auto-release було створено хибне невалідне значення `"windows"`, яке ламало `cargo check`/`tauri build` і реліз).
- **KubeLens тепер Windows-only:** видалено macOS-джоби з `release.yml` та `ci.yml`; застосунок повідомляє про непідтримувану платформу поза Windows. Оновлено README-бейдж платформи.
- Виправлено несправний CI-бейдж у README (`KubeLens-source` → `KubeLens`).
- Оновлено дефолт `workflow_dispatch` у `release.yml`.

## v0.2.1

- **Resizable detail panel:** панель деталей ресурсу тепер ресайзабельна (тягни межу зліва)
- **Update checker:** покращена обробка помилок — якщо `latest.json` ще не опубліковано, помилка не показується
- Замінено Sheet overlay на inline ResizablePanel для кращого UX

## v0.2.0

- **Платформи:** збірки лише для Windows (NSIS) та macOS (DMG); видалено Ubuntu/Linux з CI та релізу
- Оновлено README: додано бейдж платформи, прибрано згадки Linux

## v0.1.18

- Попередній стабільний реліз
