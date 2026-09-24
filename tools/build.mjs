// Copies shared/ into each widget, then validates and packages it with the
// official icuewidget CLI. Works the same on Windows and macOS/Linux.
//
//   npm run build              -> every widget in widgets/
//   npm run build -- Datacore  -> just one

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const widgetsDir = path.join(root, "widgets");
const dist = path.join(root, "dist");
const cli = path.join(root, "node_modules", "icuewidget-cli", "node-bin", "icuewidget.js");

if (!existsSync(cli)) {
  console.error("icuewidget-cli not found. Run `npm install` first.");
  process.exit(1);
}

const names = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(widgetsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

mkdirSync(dist, { recursive: true });

for (const name of names) {
  const dir = path.join(widgetsDir, name);
  if (!existsSync(path.join(dir, "manifest.json"))) {
    console.error(`Skipping ${name}: no manifest.json`);
    continue;
  }
  const target = path.join(dir, "shared");
  rmSync(target, { recursive: true, force: true });
  cpSync(path.join(root, "shared"), target, { recursive: true });

  const out = path.join(dist, `${name}.icuewidget`);
  console.log(`\n== ${name}`);
  execFileSync(process.execPath, [cli, "package", dir, "--output", out], { stdio: "inherit" });
}
