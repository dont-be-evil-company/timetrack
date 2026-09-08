import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { join } from 'path'
import { initDB, setDatabaseFilePath } from '../database'
import {
  areHandlersReady,
  initIpcHandlers,
  periodicSaveActiveTasks,
} from './ipcHandlers'
import fs from 'fs'
import { loadWindowContents } from './utils'
import icon from './../assets/icon/icon.png?asset'
import trayIconAsset from './../assets/icon/64x64.png?asset'
import {
  getConfiguredDatabases,
  getDBFilePath,
  getUserConfig,
} from '../lib/ConfigFile'
import {
  loadWindowState,
  persistWindowState,
  saveWindowState,
  windowOptionsFromState,
} from '../lib/WindowState'

let TRAY: Tray | null = null

let MAIN_WINDOW: BrowserWindow | null = null

async function chooseDatabaseForSession(
  parentWindow?: BrowserWindow,
): Promise<void> {
  const userConfig = await getUserConfig()

  if (userConfig) {
    const databases = getConfiguredDatabases(userConfig)

    // if only one database is configured, use it without asking.
    // Otherwise, prompt user to select which one to use for this session
    if (databases.length === 1) {
      setDatabaseFilePath(databases[0].path)
      return
    }

    if (databases.length > 0) {
      const buttons = databases.map(db => db.name)

      const dialogOptions = {
        type: 'question' as const,
        buttons,
        title: 'Select database',
        message:
          'A configuration file with multiple databases was found.\n\nSelect the database you want to use for this session:',
        cancelId: -1,
        noLink: true,
      }
      const { response } = parentWindow
        ? await dialog.showMessageBox(parentWindow, dialogOptions)
        : await dialog.showMessageBox(dialogOptions)

      if (response === -1) {
        // User closed the dialog or pressed Escape
        app.quit()
        return
      }

      const selected = databases[response]
      setDatabaseFilePath(selected.path)
      return
    }
  }

  // No config file or no databases configured: fall back to default location
  const defaultPath = await getDBFilePath()
  setDatabaseFilePath(defaultPath)
}

async function createWindow(): Promise<BrowserWindow> {
  const savedState = await loadWindowState()
  MAIN_WINDOW = new BrowserWindow({
    ...windowOptionsFromState(savedState),
    minWidth: 640,
    minHeight: 400,
    show: true, // Show immediately for better UX
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  })

  if (savedState.isMaximized) {
    MAIN_WINDOW.maximize()
  }

  persistWindowState(MAIN_WINDOW)

  await loadWindowContents(MAIN_WINDOW, 'index.html')

  MAIN_WINDOW.webContents.setWindowOpenHandler(details => {
    if (
      details.url.startsWith('file://') ||
      details.url.startsWith('http://localhost')
    ) {
      return { action: 'allow' }
    }
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // When the window finishes loading, check if handlers are ready and send event
  // This handles both initial load and reloads
  MAIN_WINDOW.webContents.on('did-finish-load', () => {
    if (areHandlersReady()) {
      MAIN_WINDOW?.webContents.send('app-ready')
    }
  })

  return MAIN_WINDOW
}

app.on('window-all-closed', async () => {
  if (MAIN_WINDOW && !MAIN_WINDOW.isDestroyed()) {
    await saveWindowState(MAIN_WINDOW)
  }
  await periodicSaveActiveTasks()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('app.mwco.timetrack')

  app.commandLine.appendSwitch('disable-gpu-vsync')

  const trayIcon = fs.readFileSync(trayIconAsset).toString('base64')

  const win = await createWindow()

  // Minimize to tray behavior
  win.on('minimize', () => {
    void saveWindowState(win)
    if (!TRAY) {
      TRAY = new Tray(
        nativeImage.createFromDataURL(`data:image/png;base64,${trayIcon}`),
      )
      TRAY.setToolTip('TimeTrack')
    }
    TRAY.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Show',
          click: async () => {
            TRAY?.setContextMenu(Menu.buildFromTemplate([{ role: 'quit' }]))
            if (!MAIN_WINDOW) {
              await createWindow()
            } else {
              MAIN_WINDOW.restore()
              MAIN_WINDOW.show()
            }
          },
        },
        { role: 'quit' },
      ]),
    )
    win.hide()
  })

  // When window is shown (restored from tray), notify renderer to refresh active tasks
  win.on('show', () => {
    if (areHandlersReady()) {
      win.webContents.send('window-restored')
    }
  })

  // Resolve database file path (may prompt user if config with multiple DBs exists)
  // Dialog will appear on top of the window
  await chooseDatabaseForSession(win)

  // Initialize database (will create DB file if it does not yet exist, then run migrations)
  await initDB()

  // Initialize IPC handlers now that database is ready
  // The initIpcHandlers function will send 'app-ready' event when done
  await initIpcHandlers(win)

  // Periodic save every 30 seconds
  setInterval(async () => {
    await periodicSaveActiveTasks()
  }, 30000)
})
