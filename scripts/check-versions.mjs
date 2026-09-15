import { readFileSync } from "node:fs";

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const pkg = JSON.parse(readFileSync("package.json", "utf8")).version;
const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const cargoRaw = readFileSync("src-tauri/Cargo.toml", "utf8");
const m = cargoRaw.match(/^version\s*=\s*"([^"]+)"/m);
if (!m) fail("Could not parse Cargo.toml version");
const cargo = m[1];
const plistRaw = readFileSync("src-tauri/Info.plist", "utf8");
const shortVer = plistRaw.match(
  /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
);
const buildVer = plistRaw.match(/<key>CFBundleVersion<\/key>\s*<string>([^<]+)<\/string>/);
if (!shortVer || !buildVer) fail("Could not parse src-tauri/Info.plist versions");

// Lockfiles must track the same version, otherwise the tagged commit ships
// stale dependency metadata.
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const lockVer = lock.version;
const lockPkgVer = lock.packages?.[""]?.version;
const cargoLock = readFileSync("src-tauri/Cargo.lock", "utf8");
const cargoLockVer = cargoLock.match(
  /\[\[package\]\]\nname = "kubelens"\nversion = "([^"]+)"/,
)?.[1];

console.log(
  `pkg=${pkg} tauri=${tauri} cargo=${cargo} plist=${shortVer[1]} (build ${buildVer[1]}) lock=${lockVer}/${lockPkgVer} cargolock=${cargoLockVer}`,
);
const mismatch = (name, v) => {
  if (v !== pkg) fail(`Version mismatch: ${name}=${v} but package.json=${pkg}`);
};
mismatch("tauri.conf.json", tauri);
mismatch("Cargo.toml", cargo);
mismatch("Info.plist", shortVer[1]);
mismatch("Info.plist build", buildVer[1]);
mismatch("package-lock.json", lockVer);
mismatch('package-lock.json packages[""]', lockPkgVer);
mismatch("Cargo.lock kubelens", cargoLockVer);
console.log(`Versions in sync: ${pkg}`);
