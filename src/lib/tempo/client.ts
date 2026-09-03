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

export class TempoApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'TempoApiError'
    this.status = status
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

const readErrorMessage = (body: unknown, status: number): string => {
  const record = asRecord(body)
  if (record) {
    const errorMessages = record.errorMessages
    if (Array.isArray(errorMessages) && errorMessages.length > 0) {
      return String(errorMessages[0])
    }
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error
    }
  }
  return `HTTP ${status}`
}

export const requestJson = async (
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: unknown }> => {
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
      body = { message: text.slice(0, 200) }
    }
  }
  return { status: response.status, body }
}

export const requireOk = (status: number, body: unknown, action: string) => {
  if (status >= 200 && status < 300) return
  throw new TempoApiError(
    `${action} failed: ${readErrorMessage(body, status)}`,
    status,
  )
}

const jiraHeaders = (connection: TempoConnection): HeadersInit => {
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
  const { status, body } = await requestJson(url, {
    method: 'GET',
    headers: jiraHeaders(connection),
  })
  requireOk(status, body, `Looking up issue ${issueKey}`)
  const record = asRecord(body)
  const id = record && (record.id ?? asRecord(record.issue)?.id)
  if (id === undefined || id === null) {
    throw new TempoApiError(`Issue ${issueKey} did not return an id`, status)
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
    const { status, body } = await requestJson(
      `${connection.jiraBaseUrl}/rest/api/3/myself`,
      { method: 'GET', headers: jiraHeaders(connection) },
    )
    requireOk(status, body, 'Fetching Jira account id')
    const record = asRecord(body)
    const accountId =
      record && typeof record.accountId === 'string' ? record.accountId : null
    if (!accountId) {
      throw new TempoApiError('Jira /myself did not return accountId', status)
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
      const { status, body } = await requestJson(
        'https://api.tempo.io/4/worklogs',
        {
          method: 'POST',
          headers: tempoHeaders,
          body: JSON.stringify(await worklogBody(input)),
        },
      )
      requireOk(status, body, 'Creating Tempo worklog')
      const record = asRecord(body)
      const remoteId = record?.tempoWorklogId ?? record?.id
      if (remoteId === undefined || remoteId === null) {
        throw new TempoApiError('Tempo did not return a worklog id', status)
      }
      return String(remoteId)
    },
    updateWorklog: async (remoteId, input) => {
      const { status, body } = await requestJson(
        `https://api.tempo.io/4/worklogs/${encodeURIComponent(remoteId)}`,
        {
          method: 'PUT',
          headers: tempoHeaders,
          body: JSON.stringify(await worklogBody(input)),
        },
      )
      requireOk(status, body, 'Updating Tempo worklog')
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
      const { status, body } = await requestJson(`${worklogsUrl}/`, {
        method: 'POST',
        headers,
        body: JSON.stringify(worklogBody(input)),
      })
      requireOk(status, body, 'Creating Tempo worklog')
      return remoteIdFromBody(body, status)
    },
    updateWorklog: async (remoteId, input) => {
      const { status, body } = await requestJson(
        `${worklogsUrl}/${encodeURIComponent(remoteId)}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(worklogBody(input)),
        },
      )
      requireOk(status, body, 'Updating Tempo worklog')
    },
  }
}

export const createTempoClient = (connection: TempoConnection): TempoClient => {
  if (connection.edition === 'cloud') {
    return createCloudClient(connection)
  }
  return createDatacenterClient(connection)
}
