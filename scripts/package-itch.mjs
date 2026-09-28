// Turns the TanStack Start SPA build (.output/public) into a self-contained
// itch.io HTML5 bundle: index.html at the root, relative asset paths, zipped.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { execSync } from "node:child_process";

const SRC = ".output/public";
const OUT = "itch-dist";
const ZIP = "releases/last-car-standing-itch.zip";

if (!existsSync(`${SRC}/_shell.html`)) {
  console.error(`Missing ${SRC}/_shell.html — run "npm run build" first.`);
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true });

// SPA shell becomes the entry page itch.io looks for.
renameSync(`${OUT}/_shell.html`, `${OUT}/index.html`);

// itch.io serves the game from a sub-path inside an iframe, so every URL
// must be relative (no leading "/").
let html = readFileSync(`${OUT}/index.html`, "utf8");
html = html.replaceAll("/./assets/", "./assets/").replaceAll('"/favicon.ico"', '"./favicon.ico"');
writeFileSync(`${OUT}/index.html`, html);

mkdirSync("releases", { recursive: true });
rmSync(ZIP, { force: true });
execSync(`zip -r -q ../${ZIP} .`, { cwd: OUT, stdio: "inherit" });
console.log(`Packaged ${ZIP}`);
