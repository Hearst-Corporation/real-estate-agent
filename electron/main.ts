import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import { autoUpdater } from "electron-updater";
import Store from "electron-store";
import path from "node:path";

const store = new Store<{ env: "local" | "prod" }>({ defaults: { env: "local" } });

const ENV_URLS = {
  local: "http://localhost:3002",
  prod: "https://real-estate-agent.vercel.app",
};

type AppEnv = keyof typeof ENV_URLS;

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
}

function isAppEnv(value: unknown): value is AppEnv {
  return value === "local" || value === "prod";
}

function createMainWindow(env: AppEnv) {
  store.set("env", env);
  const url = ENV_URLS[env];

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#1A050B",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.loadURL(url);

  // Liens externes → navigateur système, uniquement http(s).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") shell.openExternal(url);
    } catch {
      /* URL invalide → ignore */
    }
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Changer d'environnement…",
          click: () => {
            mainWindow?.close();
            createSplash();
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle("select-env", (_event, env: unknown) => {
  if (!isAppEnv(env)) {
    throw new Error("invalid_env");
  }
  splashWindow?.close();
  createMainWindow(env);
});

ipcMain.handle("get-last-env", () => store.get("env", "local"));

app.whenReady().then(() => {
  createSplash();
  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createSplash();
});

autoUpdater.on("update-downloaded", () => {
  autoUpdater.quitAndInstall();
});
