import { app, BrowserWindow, ipcMain, Menu, shell, type WebContents } from "electron";
import { autoUpdater } from "electron-updater";
import Store from "electron-store";
import path from "node:path";

const store = new Store<{ env: "local" | "prod" }>({ defaults: { env: "local" } });

/** Couleur de fond native Electron — doit correspondre à --ct-bg de 00-tokens.css. */
const WINDOW_BG = "#1A050B";

const ENV_URLS = {
  local: "http://localhost:3002",
  prod: "https://real-estate-agent.vercel.app",
};

type AppEnv = keyof typeof ENV_URLS;

/**
 * Origines de confiance vers lesquelles le renderer a le droit de naviguer
 * dans la fenêtre principale. Toute autre origine est refusée (fail-closed) et,
 * si c'est du http(s), ouverte dans le navigateur système.
 */
const TRUSTED_ORIGINS = new Set(Object.values(ENV_URLS).map((u) => new URL(u).origin));

/** Préférences de sécurité communes à toutes les fenêtres (fail-closed). */
const SECURE_WEB_PREFERENCES = {
  preload: path.join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
} as const;

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

function isAppEnv(value: unknown): value is AppEnv {
  return value === "local" || value === "prod";
}

/** Ouvre une URL http(s) dans le navigateur système ; ignore tout autre schéma. */
function openExternalIfHttp(rawUrl: string) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === "http:" || u.protocol === "https:") void shell.openExternal(rawUrl);
  } catch {
    /* URL invalide → ignore */
  }
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: SECURE_WEB_PREFERENCES,
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
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
    backgroundColor: WINDOW_BG,
    webPreferences: SECURE_WEB_PREFERENCES,
  });

  void mainWindow.loadURL(url);

  // Navigation restreinte : le renderer ne peut naviguer que vers une origine
  // de confiance (env local/prod). Tout le reste est refusé ; http(s) part vers
  // le navigateur système, le reste est simplement bloqué.
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    let origin: string | null = null;
    try {
      origin = new URL(navigationUrl).origin;
    } catch {
      origin = null;
    }
    if (origin && TRUSTED_ORIGINS.has(origin)) return;
    event.preventDefault();
    openExternalIfHttp(navigationUrl);
  });

  // Liens externes → navigateur système, uniquement http(s) ; jamais de nouvelle
  // fenêtre Electron ouverte par le contenu web.
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    openExternalIfHttp(openUrl);
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

/**
 * Garde-fou global : pour TOUT WebContents créé (y compris frames/embeds
 * inattendus), on refuse l'attachement de <webview> et l'ouverture de fenêtres,
 * et on bloque toute navigation hors origines de confiance.
 */
function hardenWebContents(contents: WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    openExternalIfHttp(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  contents.on("will-navigate", (event, navigationUrl) => {
    let origin: string | null = null;
    try {
      origin = new URL(navigationUrl).origin;
    } catch {
      origin = null;
    }
    // Autorise le fichier splash local et les origines de confiance ; refuse le reste.
    if (navigationUrl.startsWith("file:")) return;
    if (origin && TRUSTED_ORIGINS.has(origin)) return;
    event.preventDefault();
    openExternalIfHttp(navigationUrl);
  });
}

app.on("web-contents-created", (_event, contents) => {
  hardenWebContents(contents);
});

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
  if (app.isPackaged) void autoUpdater.checkForUpdatesAndNotify();
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
