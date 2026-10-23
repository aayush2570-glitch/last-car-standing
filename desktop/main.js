// Electron 22 (Chromium 108) — the last Electron that runs on Windows 7 / 8 / 8.1.
const { app, BrowserWindow, protocol, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

const GAME_DIR = path.join(__dirname, "game");

// Serve the game from a secure custom origin (app://game/) instead of file://
// so ES modules, fetch(), the service worker and SPA routing behave like on the web.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.ico"),
    webPreferences: { contextIsolation: true, autoplayPolicy: "no-user-gesture-required" },
  });
  Menu.setApplicationMenu(null);
  win.loadURL("app://game/");
  win.webContents.on("before-input-event", (_e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") win.setFullScreen(!win.isFullScreen());
    if (input.key === "Escape" && win.isFullScreen()) win.setFullScreen(false);
  });
}

app.whenReady().then(() => {
  protocol.registerFileProtocol("app", (request, callback) => {
    const { pathname } = new URL(request.url);
    let rel = decodeURIComponent(pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    let filePath = path.normalize(path.join(GAME_DIR, rel));
    if (!filePath.startsWith(GAME_DIR)) return callback({ error: -10 });
    // SPA fallback: unknown routes load index.html
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(GAME_DIR, "index.html");
    }
    callback({ path: filePath });
  });
  createWindow();
});

app.on("window-all-closed", () => app.quit());
