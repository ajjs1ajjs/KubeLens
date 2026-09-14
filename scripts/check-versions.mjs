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
const plistRaw = readFileSync("src-tauri/Info.plist", "utf8");
const shortVer = plistRaw.match(
  /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
);
const buildVer = plistRaw.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/);
if (!shortVer || !buildVer) {
  console.error("Could not parse src-tauri/Info.plist versions");
  process.exit(1);
}

console.log(`pkg=${pkg} tauri=${tauri} cargo=${cargo} plist=${shortVer[1]} (build ${buildVer[1]})`);
if (pkg !== tauri || pkg !== cargo || pkg !== shortVer[1] || pkg !== buildVer[1]) {
  console.error(
    `Version mismatch: pkg=${pkg} tauri=${tauri} cargo=${cargo} plist=${shortVer[1]} build=${buildVer[1]} — run ./scripts/bump-version.ps1 <version> to sync`,
  );
  process.exit(1);
}
console.log(`Versions in sync: ${pkg}`);
