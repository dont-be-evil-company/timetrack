import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { getUserDataDir } from './ConfigFile'

export const DEFAULT_WINDOW_WIDTH = 960
export const DEFAULT_WINDOW_HEIGHT = 600
const MIN_WINDOW_WIDTH = 640
const MIN_WINDOW_HEIGHT = 400

export type WindowState = {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

const getWindowStatePath = (): string =>
  path.join(getUserDataDir(), 'window-state.json')

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const parseWindowState = (raw: unknown): WindowState | null => {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (!isFiniteNumber(record.width) || !isFiniteNumber(record.height)) {
    return null
  }
  const state: WindowState = {
    width: Math.max(MIN_WINDOW_WIDTH, Math.round(record.width)),
    height: Math.max(MIN_WINDOW_HEIGHT, Math.round(record.height)),
  }
  if (isFiniteNumber(record.x)) state.x = Math.round(record.x)
  if (isFiniteNumber(record.y)) state.y = Math.round(record.y)
  if (record.isMaximized === true) state.isMaximized = true
  return state
}

const isOnScreen = (state: WindowState): boolean => {
  if (state.x === undefined || state.y === undefined) return false
  const bounds = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
  }
  return screen.getAllDisplays().some(display => {
    const area = display.workArea
    const overlapWidth =
      Math.min(bounds.x + bounds.width, area.x + area.width) -
      Math.max(bounds.x, area.x)
    const overlapHeight =
      Math.min(bounds.y + bounds.height, area.y + area.height) -
      Math.max(bounds.y, area.y)
    return overlapWidth > 100 && overlapHeight > 100
  })
}

export const loadWindowState = async (): Promise<WindowState> => {
  try {
    const content = await readFile(getWindowStatePath(), 'utf8')
    const parsed = parseWindowState(JSON.parse(content))
    if (parsed) return parsed
  } catch {
    // Missing or invalid file: use defaults
  }
  return { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT }
}

export const saveWindowState = async (win: BrowserWindow): Promise<void> => {
  if (win.isDestroyed()) return
  const isMaximized = win.isMaximized()
  const bounds =
    isMaximized || win.isMinimized() ? win.getNormalBounds() : win.getBounds()
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized,
  }
  const userDataDir = getUserDataDir()
  await mkdir(userDataDir, { recursive: true })
  await writeFile(getWindowStatePath(), JSON.stringify(state), 'utf8')
}

export const windowOptionsFromState = (
  state: WindowState,
): { width: number; height: number; x?: number; y?: number } => {
  const options: { width: number; height: number; x?: number; y?: number } = {
    width: state.width,
    height: state.height,
  }
  if (isOnScreen(state)) {
    options.x = state.x
    options.y = state.y
  }
  return options
}

export const persistWindowState = (win: BrowserWindow): void => {
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void saveWindowState(win)
    }, 300)
  }

  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
  win.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    void saveWindowState(win)
  })
}
