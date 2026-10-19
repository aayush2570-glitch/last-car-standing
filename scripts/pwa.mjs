// Post-build step for the offline PWA: lists every file of the build in the service worker so the
// whole game is downloaded on the first visit, and stamps a version so updates replace the old cache.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const DIR = ".output/public";
if (!existsSync(join(DIR, "sw.js"))) {
  console.error(`Missing ${DIR}/sw.js — run "vite build" first.`);
  process.exit(1);
}

const walk = (d) =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const SKIP = new Set(["sw.js", "_shell.html", "robots.txt"]);
const files = walk(DIR)
  .map((p) => relative(DIR, p).split("\\").join("/"))
  .filter((f) => !SKIP.has(f))
  .sort();

// the version changes whenever any file (hashed names included) or the worker itself changes
const swPath = join(DIR, "sw.js");
let sw = readFileSync(swPath, "utf8");
const version = createHash("sha1").update(files.join("|")).update(sw).digest("hex").slice(0, 10);

sw = sw
  .replace('const VERSION = "dev";', `const VERSION = ${JSON.stringify(version)};`)
  .replace("const PRECACHE = [];", `const PRECACHE = ${JSON.stringify(files)};`);
writeFileSync(swPath, sw);
console.log(`PWA: precaching ${files.length} files, cache version ${version}`);
