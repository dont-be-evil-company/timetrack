import os from 'node:os'
import logger from 'node-color-log'
import path from 'node:path'
import { access, mkdir, readFile } from 'node:fs/promises'
import { load as yamlLoader } from 'js-yaml'

export type UserConfigFile = null | {
  /**
   * Optional list/map of named database paths.
   *
   * YAML example:
   *
   * databases:
   *   - marco: /home/marco/Desktop/timetrack.db
   *   - work: /home/marco/Desktop/timetrack-work.db
   */
  databases?: Array<Record<string, string>> | Record<string, string>
}

const APP_NAME = 'timetrack'

export function getUserConfigDir() {
  const platform = process.platform

  if (platform === 'win32') {
    // Windows: %APPDATA%\timetrack (e.g. C:\Users\<User>\AppData\Roaming\timetrack)
    return (
      process.env.APPDATA ||
      path.join(os.homedir(), 'AppData', 'Roaming', APP_NAME)
    )
  }

  if (platform === 'darwin') {
    // macOS: ~/Library/Preferences/timetrack
    return path.join(os.homedir(), 'Library', 'Preferences', APP_NAME)
  }

  // Linux and other POSIX: ~/.config/timetrack (per XDG spec)
  return process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, APP_NAME)
    : path.join(os.homedir(), '.config', APP_NAME)
}

/**
 * Per-OS user data directory for the application.
 *
 * On Linux this resolves to `$XDG_DATA_HOME/timetrack` or `~/.local/share/timetrack`.
 */
export function getUserDataDir() {
  const platform = process.platform

  if (platform === 'win32') {
    // Windows: %LOCALAPPDATA%\timetrack (e.g. C:\Users\<User>\AppData\Local\timetrack)
    const base =
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    return path.join(base, APP_NAME)
  }

  if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/timetrack
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME)
  }

  // Linux and other POSIX: $XDG_DATA_HOME/timetrack or ~/.local/share/timetrack
  const dataHome =
    process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(dataHome, APP_NAME)
}

/**
 * Default database file path in the per-OS user data directory.
 *
 * For Linux this will be something like:
 *   /home/<user>/.local/share/timetrack/timetrack.db
 */
export const getDBFilePath = async (): Promise<string> => {
  const userDataDir = getUserDataDir()
  try {
    await access(userDataDir)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      logger.warn('📢 Creating user data dir:', userDataDir)
      await mkdir(userDataDir, { recursive: true })
    }
  }
  const dbFilePath = path.join(userDataDir, 'timetrack.db')
  return dbFilePath
}

export const getUserConfig = async (): Promise<UserConfigFile> => {
  const userConfigDir = getUserConfigDir()
  const configFilePath = path.join(userConfigDir, 'config.yaml')
  try {
    await access(configFilePath)
    const content = await readFile(configFilePath, 'utf8')
    const config = yamlLoader(content) as UserConfigFile
    logger.warn('User config loaded ✨', config)
    return config
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      logger.info(
        '📢 No user config file found, using defaults 😇',
        configFilePath,
      )
    } else {
      logger.warn('⚠️ Failed to read user config file', error)
    }
  }
  return null
}

export type NamedDatabase = {
  name: string
  path: string
}

/**
 * Resolve the list of named databases from the user config.
 * Handles both the documented array-of-singleton-maps format and an
 * optional plain object map.
 */
export function getConfiguredDatabases(
  config: UserConfigFile,
): NamedDatabase[] {
  if (!config || !config.databases) {
    return []
  }

  const result: NamedDatabase[] = []
  const pushEntry = (name: string, value: unknown) => {
    if (typeof value !== 'string') {
      logger.warn(
        '⚠️ Ignoring invalid database path (not a string) for key',
        name,
      )
      return
    }
    result.push({ name, path: value })
  }

  if (Array.isArray(config.databases)) {
    for (const entry of config.databases) {
      if (!entry || typeof entry !== 'object') continue
      for (const [name, value] of Object.entries(entry)) {
        pushEntry(name, value)
      }
    }
  } else if (typeof config.databases === 'object') {
    for (const [name, value] of Object.entries(config.databases)) {
      pushEntry(name, value)
    }
  }

  // Ensure unique names (last one wins) while preserving order as much as possible
  const seen = new Set<string>()
  const deduped: NamedDatabase[] = []
  for (let i = result.length - 1; i >= 0; i -= 1) {
    const entry = result[i]
    if (seen.has(entry.name)) continue
    seen.add(entry.name)
    deduped.unshift(entry)
  }

  return deduped
}
