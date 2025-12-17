import { app, BrowserWindow, shell, ipcMain,Menu } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { update } from './update'


const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = app.isPackaged 
  ? path.join(path.dirname(app.getAppPath()), '..')
  : path.join(__dirname, '../..')

const APP_ROOT = process.env.APP_ROOT || path.join(__dirname, '../..')
export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(APP_ROOT, 'public')
  : RENDERER_DIST
process.env.VITE_PUBLIC = VITE_PUBLIC

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let goProcess: ChildProcess | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'Cry - High Performance Load Testing Tool',
    icon: path.join(VITE_PUBLIC, 'favicon.ico'),
    width: 1200,
    height: 750,
    webPreferences: {
      preload,
      nodeIntegration: true,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })


  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      role: "fileMenu",
    },
    {
      label: "Edit",
      role: "editMenu",
    },
    {
      label: "View",
      submenu: [
        {
          label: "Reload",
          role: "reload",
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Minimize",
          role: "minimize",
        },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "GitHub",
          click: () => {
            shell.openExternal("https://github.com/Muhammad-Sarfaraz/Cry");
          },
        },
      ],
    },
  ];
  
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  startGoEngine();

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Auto update
  update(win)
}

function getGoBinaryName(): string {
  if (process.platform === 'win32') {
    return 'cry-engine.exe'
  }
  return 'cry-engine'
}

function startGoEngine(): void {
  if (goProcess) {
    console.log('Go engine already running')
    return
  }

  const isDev = !app.isPackaged
  const cryEngineDir = path.join(APP_ROOT, 'cry-engine')
  
  console.log(`[Go Engine] APP_ROOT: ${APP_ROOT}`)
  console.log(`[Go Engine] cry-engine dir: ${cryEngineDir}`)
  console.log(`[Go Engine] isDev: ${isDev}`)
  
  let command: string
  let args: string[]
  let cwd: string

  if (isDev) {
    const mainGoPath = path.join(cryEngineDir, 'cmd', 'server', 'main.go')
    if (!existsSync(mainGoPath)) {
      const error = `main.go not found at ${mainGoPath}. Make sure cry-engine directory exists.`
      console.error(`[Go Engine] ${error}`)
      win?.webContents.send('go-engine-error', error)
      return
    }
    
    command = 'go'
    args = ['run', './cmd/server']
    cwd = cryEngineDir
    console.log(`[Go Engine] Starting in dev mode: ${command} ${args.join(' ')}`)
    console.log(`[Go Engine] Working directory: ${cwd}`)
  } else {
    const binaryName = getGoBinaryName()
    const exePath = path.join(cryEngineDir, 'build', binaryName)
    
    if (!existsSync(exePath)) {
      const error = `Go binary not found at ${exePath}`
      console.error(`[Go Engine] ${error}`)
      win?.webContents.send('go-engine-error', error)
      return
    }
    
    command = exePath
    args = []
    cwd = cryEngineDir
    console.log(`[Go Engine] Starting from compiled binary: ${exePath}`)
  }

  try {
    goProcess = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: process.env
    })

    goProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim()
      if (output) {
        console.log(`[Go Engine] ${output}`)
      }
    })

    goProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim()
      if (output) {
        console.error(`[Go Engine Error] ${output}`)
      }
    })

    goProcess.on('error', (error) => {
      const errorMsg = `Failed to start Go engine: ${error.message}`
      console.error(`[Go Engine] ${errorMsg}`)
      if (isDev && error.message.includes('ENOENT')) {
        const helpMsg = 'Go is not installed or not in PATH. Please install Go: https://go.dev/dl/'
        console.error(`[Go Engine] ${helpMsg}`)
        win?.webContents.send('go-engine-error', `${errorMsg}\n${helpMsg}`)
      } else {
        win?.webContents.send('go-engine-error', errorMsg)
      }
      goProcess = null
    })

    goProcess.on('exit', (code, signal) => {
      if (code !== null) {
        console.log(`[Go Engine] Exited with code ${code}${signal ? ` and signal ${signal}` : ''}`)
      }
      goProcess = null
      
      if (code !== 0 && code !== null) {
        const crashMsg = `Go engine crashed with code ${code}${signal ? ` and signal ${signal}` : ''}`
        console.error(`[Go Engine] ${crashMsg}`)
        win?.webContents.send('go-engine-crashed', { code, signal })
      }
    })

    console.log('[Go Engine] Process spawned, waiting for startup...')
  } catch (error) {
    const errorMsg = `Error starting Go engine: ${error}`
    console.error(`[Go Engine] ${errorMsg}`)
    win?.webContents.send('go-engine-error', errorMsg)
  }
}

function stopGoEngine(): void {
  if (goProcess) {
    console.log('Stopping Go engine...')
    goProcess.kill('SIGTERM')
    
    const timeout = setTimeout(() => {
      if (goProcess) {
        console.log('Force killing Go engine...')
        goProcess.kill('SIGKILL')
      }
    }, 5000)

    goProcess.on('exit', () => {
      clearTimeout(timeout)
      goProcess = null
      console.log('Go engine stopped')
    })
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  stopGoEngine()
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopGoEngine()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})
