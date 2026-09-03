import logger from 'node-color-log'
import path from 'node:path'
import { access, readFile, stat } from 'node:fs/promises'
import yaml from 'js-yaml'
import { getUserDataDir } from './ConfigFile'

export type TempoEdition = 'cloud' | 'datacenter'

export type TempoCloudConnection = {
  name: string
  edition: 'cloud'
  jiraBaseUrl: string
  tempoToken: string
  jiraEmail: string
  jiraApiToken: string
}

export type TempoDatacenterConnection = {
  name: string
  edition: 'datacenter'
  jiraBaseUrl: string
  jiraUsername: string
  jiraToken: string
}

export type TempoConnection = TempoCloudConnection | TempoDatacenterConnection

export type SyncConfigFile = {
  tempo?: {
    connections?: unknown
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export const getSyncConfigPath = (): string =>
  path.join(getUserDataDir(), 'sync.yaml')

const warnIfInsecurePermissions = async (filePath: string) => {
  if (process.platform === 'win32') return
  try {
    const info = await stat(filePath)
    if ((info.mode & 0o077) !== 0) {
      logger.warn(
        '⚠️ sync.yaml is readable by group or others; chmod 600 is recommended',
        filePath,
      )
    }
  } catch {
    // Ignore permission probe failures
  }
}

const parseConnection = (raw: unknown): TempoConnection | null => {
  if (!isRecord(raw)) return null

  const name = asNonEmptyString(raw.name)
  const edition = asNonEmptyString(raw.edition)
  const jiraBaseUrl = asNonEmptyString(raw.jiraBaseUrl)?.replace(/\/+$/, '')

  if (!name || !jiraBaseUrl) {
    logger.warn('⚠️ Ignoring Tempo connection with missing name or jiraBaseUrl')
    return null
  }

  if (edition === 'cloud') {
    const tempoToken = asNonEmptyString(raw.tempoToken)
    const jiraEmail = asNonEmptyString(raw.jiraEmail)
    const jiraApiToken = asNonEmptyString(raw.jiraApiToken)
    if (!tempoToken || !jiraEmail || !jiraApiToken) {
      logger.warn(
        '⚠️ Ignoring Tempo Cloud connection with missing credentials:',
        name,
      )
      return null
    }
    return {
      name,
      edition: 'cloud',
      jiraBaseUrl,
      tempoToken,
      jiraEmail,
      jiraApiToken,
    }
  }

  if (edition === 'datacenter') {
    const jiraUsername = asNonEmptyString(raw.jiraUsername)
    const jiraToken = asNonEmptyString(raw.jiraToken)
    if (!jiraUsername || !jiraToken) {
      logger.warn(
        '⚠️ Ignoring Tempo Data Center connection with missing credentials:',
        name,
      )
      return null
    }
    return {
      name,
      edition: 'datacenter',
      jiraBaseUrl,
      jiraUsername,
      jiraToken,
    }
  }

  logger.warn('⚠️ Ignoring Tempo connection with invalid edition:', name)
  return null
}

const parseConnections = (raw: unknown): TempoConnection[] => {
  if (!raw) return []

  const entries: unknown[] = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Object.entries(raw).map(([name, value]) =>
          isRecord(value) ? { name, ...value } : null,
        )
      : []

  const result: TempoConnection[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const connection = parseConnection(entry)
    if (!connection) continue
    if (seen.has(connection.name)) {
      logger.warn(
        '⚠️ Duplicate Tempo connection name, last one wins:',
        connection.name,
      )
      const existingIndex = result.findIndex(c => c.name === connection.name)
      if (existingIndex >= 0) result.splice(existingIndex, 1)
    }
    seen.add(connection.name)
    result.push(connection)
  }
  return result
}

export const getSyncConfig = async (): Promise<TempoConnection[]> => {
  const syncFilePath = getSyncConfigPath()
  try {
    await access(syncFilePath)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return []
    }
    logger.warn('⚠️ Failed to access sync.yaml')
    return []
  }

  await warnIfInsecurePermissions(syncFilePath)

  try {
    const content = await readFile(syncFilePath, 'utf8')
    const parsed = yaml.load(content) as SyncConfigFile | null
    if (!parsed || typeof parsed !== 'object') {
      return []
    }
    const connections = parseConnections(parsed.tempo?.connections)
    if (connections.length > 0) {
      logger.info(
        '✨ Loaded Tempo connections from sync.yaml:',
        connections.map(c => c.name).join(', '),
      )
    }
    return connections
  } catch (error) {
    logger.warn('⚠️ Failed to read sync.yaml', error)
    return []
  }
}

export const getTempoConnectionNames = async (): Promise<string[]> => {
  const connections = await getSyncConfig()
  return connections.map(c => c.name)
}

export const getTempoConnection = async (
  name: string,
): Promise<TempoConnection | null> => {
  const connections = await getSyncConfig()
  return connections.find(c => c.name === name) ?? null
}
