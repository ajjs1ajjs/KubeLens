import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8")).version;
const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const cargoRaw = readFileSync("src-tauri/Cargo.toml", "utf8");
const m = cargoRaw.match(/^version\s*=\s*"([^"]+)"/m);
if (!m) {
  console.error("Could not parse Cargo.toml version");
  process.exit(1);
}
const cargo = m[1];

console.log(`pkg=${pkg} tauri=${tauri} cargo=${cargo}`);
if (pkg !== tauri || pkg !== cargo) {
  console.error(`Version mismatch: pkg=${pkg} tauri=${tauri} cargo=${cargo} — run ./scripts/bump-version.ps1 <version> to sync`);
  process.exit(1);
}
console.log(`Versions in sync: ${pkg}`);
