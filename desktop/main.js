const { app, BrowserWindow, protocol, net, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const GAME_DIR = path.join(__dirname, "game");

// Serve the game from a secure custom origin (app://game/) instead of file://
// so ES modules, fetch(), the service worker and SPA routing all behave like on the web.
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
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    let rel = decodeURIComponent(pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    let filePath = path.normalize(path.join(GAME_DIR, rel));
    if (!filePath.startsWith(GAME_DIR)) return new Response("Forbidden", { status: 403 });
    // SPA fallback: unknown routes load index.html
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(GAME_DIR, "index.html");
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
  createWindow();
});

app.on("window-all-closed", () => app.quit());
