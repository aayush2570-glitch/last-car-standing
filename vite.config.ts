// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Oldest browser we support. Chrome 109 is the last Chrome for Windows 7/8/8.1 and macOS 10.11–10.12.
// It lacks oklch(), color-mix(), CSS nesting and a handful of newer JS APIs, so the build
// transpiles JS down to chrome109 and lets lightningcss rewrite modern CSS colour syntax.
const CHROME = 109;
const chromeTarget = CHROME << 16; // lightningcss encodes versions as major << 16

export default defineConfig({
  tanstackStart: {
    // SPA mode: emits a static dist/client/index.html shell (needed for itch.io).
    spa: { enabled: true },
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    base: "./",
    css: {
      transformer: "lightningcss",
      lightningcss: { targets: { chrome: chromeTarget } },
    },
    build: {
      target: `chrome${CHROME}`,
      cssTarget: `chrome${CHROME}`,
      cssMinify: "lightningcss",
    },
  },
});
