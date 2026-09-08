import type { TempoConnection } from '../SyncConfig'

export type WorklogInput = {
  issueKey: string
  issueId: string
  timeSpentSeconds: number
  startDateTime: string
  description: string
}

export type TempoClient = {
  resolveIssueId: (issueKey: string) => Promise<string>
  createWorklog: (input: WorklogInput) => Promise<string>
  updateWorklog: (remoteId: string, input: WorklogInput) => Promise<void>
}

export type JsonResponse = {
  status: number
  statusText: string
  body: unknown
  method: string
  url: string
}

export class TempoApiError extends Error {
  status: number
  action?: string
  body?: unknown
  method?: string
  url?: string

  constructor(
    message: string,
    status: number,
    options?: {
      action?: string
      body?: unknown
      method?: string
      url?: string
    },
  ) {
    super(message)
    this.name = 'TempoApiError'
    this.status = status
    this.action = options?.action
    this.body = options?.body
    this.method = options?.method
    this.url = options?.url
  }
}

export const splitStartDateTime = (
  startDateTime: string,
): { startDate: string; startTime: string } => {
  const normalized = startDateTime.replace('T', ' ').trim()
  const [datePart, timePart = '00:00:00'] = normalized.split(' ')
  const startTime = timePart.length === 5 ? `${timePart}:00` : timePart
  return { startDate: datePart, startTime }
}

const basicAuth = (username: string, password: string): string =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

type JsonRecord = Record<string, unknown>

const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null

const uniqueStrings = (items: string[]): string[] => [...new Set(items)]

const pushTrimmed = (items: string[], value: unknown) => {
  if (typeof value !== 'string') return
  const trimmed = value.trim()
  if (trimmed) items.push(trimmed)
}

const collectErrorMessages = (body: unknown): string[] => {
  const messages: string[] = []
  if (typeof body === 'string') {
    pushTrimmed(messages, body)
    return uniqueStrings(messages)
  }

  const record = asRecord(body)
  if (!record) return messages

  if (Array.isArray(record.errorMessages)) {
    record.errorMessages.forEach(item => pushTrimmed(messages, item))
  }

  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      if (typeof item === 'string') {
        pushTrimmed(messages, item)
        continue
      }
      const error = asRecord(item)
      pushTrimmed(
        messages,
        error?.message ?? error?.error ?? error?.errorMessage,
      )
    }
  } else {
    const fieldErrors = asRecord(record.errors)
    if (fieldErrors) {
      for (const [field, value] of Object.entries(fieldErrors)) {
        if (typeof value === 'string' && value.trim()) {
          messages.push(`${field}: ${value.trim()}`)
        }
      }
    }
  }

  if (Array.isArray(record.reasons)) {
    record.reasons.forEach(item => pushTrimmed(messages, item))
  }

  pushTrimmed(messages, record.message)
  pushTrimmed(messages, record.error)
  pushTrimmed(messages, record.errorMessage)

  const nestedError = asRecord(record.error)
  if (nestedError) {
    pushTrimmed(messages, nestedError.message)
    pushTrimmed(messages, nestedError.errorMessage)
  }

  return uniqueStrings(messages)
}

const isUnhelpfulMessage = (message: string, status: number): boolean => {
  const normalized = message.replace(/^HTTP\s+/i, '').trim()
  if (!normalized) return true
  if (normalized === String(status)) return true
  return /^(forbidden|unauthorized|access denied|error)$/i.test(normalized)
}

const serializeErrorBody = (body: unknown): string | null => {
  if (body === null || body === undefined) return null
  try {
    const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2)
    const trimmed = text.trim()
    if (
      !trimmed ||
      trimmed === '{}' ||
      trimmed === 'null' ||
      trimmed === '[]'
    ) {
      return null
    }
    return trimmed.length > 800 ? `${trimmed.slice(0, 800)}...` : trimmed
  } catch {
    return null
  }
}

const readErrorMessage = (body: unknown, status: number): string =>
  collectErrorMessages(body)
    .filter(message => !isUnhelpfulMessage(message, status))
    .join('; ')

const responseContext = (result: JsonResponse) => ({
  body: result.body,
  method: result.method,
  url: result.url,
})

export const tempoApiErrorDetail = (
  error: TempoApiError,
): string | undefined => {
  const lines: string[] = []
  if (error.method && error.url) {
    lines.push(`${error.method} ${error.url}`)
  }
  const dump = serializeErrorBody(error.body)
  if (dump) lines.push(dump)
  return lines.length > 0 ? lines.join('\n') : undefined
}

export const requestJson = async (
  url: string,
  init: RequestInit,
): Promise<JsonResponse> => {
  const method = (init.method ?? 'GET').toUpperCase()
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { message: text.slice(0, 500) }
    }
  }
  return {
    status: response.status,
    statusText: response.statusText,
    body,
    method,
    url,
  }
}

export const requireOk = (result: JsonResponse, action: string) => {
  if (result.status >= 200 && result.status < 300) return
  const httpLabel = result.statusText?.trim()
    ? `HTTP ${result.status} ${result.statusText.trim()}`
    : `HTTP ${result.status}`
  const detail = readErrorMessage(result.body, result.status)
  const suffix = detail ? `: ${detail}` : ''
  throw new TempoApiError(
    `${action} failed (${httpLabel})${suffix}`,
    result.status,
    { action, ...responseContext(result) },
  )
}

export const jiraHeaders = (connection: TempoConnection): HeadersInit => {
  if (connection.edition === 'cloud') {
    return {
      Authorization: basicAuth(connection.jiraEmail, connection.jiraApiToken),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }
  }
  return {
    Authorization: basicAuth(connection.jiraUsername, connection.jiraToken),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

export const resolveJiraIssueId = async (
  connection: TempoConnection,
  issueKey: string,
): Promise<string> => {
  const apiVersion = connection.edition === 'cloud' ? '3' : '2'
  const url = `${connection.jiraBaseUrl}/rest/api/${apiVersion}/issue/${encodeURIComponent(
    issueKey,
  )}?fields=id`
  const result = await requestJson(url, {
    method: 'GET',
    headers: jiraHeaders(connection),
  })
  requireOk(result, `Looking up issue ${issueKey}`)
  const record = asRecord(result.body)
  const id = record && (record.id ?? asRecord(record.issue)?.id)
  if (id === undefined || id === null) {
    throw new TempoApiError(
      `Issue ${issueKey} did not return an id`,
      result.status,
      responseContext(result),
    )
  }
  return String(id)
}

export const createCloudClient = (
  connection: Extract<TempoConnection, { edition: 'cloud' }>,
): TempoClient => {
  let authorAccountId: string | null = null
  const tempoHeaders = {
    Authorization: `Bearer ${connection.tempoToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  const getAuthorAccountId = async (): Promise<string> => {
    if (authorAccountId) return authorAccountId
    const result = await requestJson(
      `${connection.jiraBaseUrl}/rest/api/3/myself`,
      { method: 'GET', headers: jiraHeaders(connection) },
    )
    requireOk(result, 'Fetching Jira account id')
    const record = asRecord(result.body)
    const accountId =
      record && typeof record.accountId === 'string' ? record.accountId : null
    if (!accountId) {
      throw new TempoApiError(
        'Jira /myself did not return accountId',
        result.status,
        responseContext(result),
      )
    }
    authorAccountId = accountId
    return accountId
  }

  const worklogBody = async (input: WorklogInput) => {
    const { startDate, startTime } = splitStartDateTime(input.startDateTime)
    return {
      issueId: Number(input.issueId),
      timeSpentSeconds: input.timeSpentSeconds,
      startDate,
      startTime,
      description: input.description,
      authorAccountId: await getAuthorAccountId(),
    }
  }

  return {
    resolveIssueId: issueKey => resolveJiraIssueId(connection, issueKey),
    createWorklog: async input => {
      const result = await requestJson('https://api.tempo.io/4/worklogs', {
        method: 'POST',
        headers: tempoHeaders,
        body: JSON.stringify(await worklogBody(input)),
      })
      requireOk(result, 'Creating Tempo worklog')
      const record = asRecord(result.body)
      const remoteId = record?.tempoWorklogId ?? record?.id
      if (remoteId === undefined || remoteId === null) {
        throw new TempoApiError(
          'Tempo did not return a worklog id',
          result.status,
          responseContext(result),
        )
      }
      return String(remoteId)
    },
    updateWorklog: async (remoteId, input) => {
      const result = await requestJson(
        `https://api.tempo.io/4/worklogs/${encodeURIComponent(remoteId)}`,
        {
          method: 'PUT',
          headers: tempoHeaders,
          body: JSON.stringify(await worklogBody(input)),
        },
      )
      requireOk(result, 'Updating Tempo worklog')
    },
  }
}

export const createDatacenterClient = (
  connection: Extract<TempoConnection, { edition: 'datacenter' }>,
): TempoClient => {
  const headers = jiraHeaders(connection)
  const worklogsUrl = `${connection.jiraBaseUrl}/rest/tempo-timesheets/4/worklogs`

  const worklogBody = (input: WorklogInput) => {
    const { startDate, startTime } = splitStartDateTime(input.startDateTime)
    return {
      originTaskId: input.issueId,
      timeSpentSeconds: input.timeSpentSeconds,
      started: `${startDate}T${startTime}.000`,
      comment: input.description,
    }
  }

  const remoteIdFromBody = (body: unknown, status: number): string => {
    const record = asRecord(body)
    const remoteId = record?.tempoWorklogId ?? record?.id
    if (remoteId === undefined || remoteId === null) {
      throw new TempoApiError('Tempo did not return a worklog id', status)
    }
    return String(remoteId)
  }

  return {
    resolveIssueId: issueKey => resolveJiraIssueId(connection, issueKey),
    createWorklog: async input => {
      const result = await requestJson(`${worklogsUrl}/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(worklogBody(input)),
      })
      requireOk(result, 'Creating Tempo worklog')
      return remoteIdFromBody(result.body, result.status)
    },
    updateWorklog: async (remoteId, input) => {
      const result = await requestJson(
        `${worklogsUrl}/${encodeURIComponent(remoteId)}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(worklogBody(input)),
        },
      )
      requireOk(result, 'Updating Tempo worklog')
    },
  }
}

export const createTempoClient = (connection: TempoConnection): TempoClient => {
  if (connection.edition === 'cloud') {
    return createCloudClient(connection)
  }
  return createDatacenterClient(connection)
}
