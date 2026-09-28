# Pixel Perfect View

Implement exactly the screenshot and nothing else

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/940a27af-8c38-4551-bf25-15e6fefad2cf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Browser support

The game targets **Chrome 109 and newer** (the last Chrome for Windows 7/8/8.1 and macOS 10.11–10.12).

- `vite.config.ts` builds JS for `chrome109` and runs CSS through lightningcss, which rewrites `oklch()` and `color-mix()` into plain rgb.
- Canvas colours and all game CSS use plain hex / `rgba()`; canvas silently ignores colours it cannot parse, so never feed it `oklch()`.
- Avoid: CSS nesting, `text-wrap`, `light-dark()`, `@starting-style`, `scrollbar-width`, and JS such as `toSorted`, `Object.groupBy`, `Promise.withResolvers`.
