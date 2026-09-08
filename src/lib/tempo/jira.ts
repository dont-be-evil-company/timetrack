import type { TempoConnection } from '../SyncConfig'
import { jiraHeaders, requestJson, requireOk, TempoApiError } from './client'

const ISSUE_FIELDS = [
  'summary',
  'issuetype',
  'assignee',
  'reporter',
  'status',
  'resolution',
  'created',
] as const

const MAX_RESULTS = 50

type JsonRecord = Record<string, unknown>

const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined

const apiVersion = (connection: TempoConnection): '2' | '3' =>
  connection.edition === 'cloud' ? '3' : '2'

const jiraUrl = (connection: TempoConnection, path: string): string =>
  `${connection.jiraBaseUrl}/rest/api/${apiVersion(connection)}${path}`

const escapeJqlString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const looksLikeIssueKey = (text: string): boolean =>
  /^[A-Z][A-Z0-9_]+-\d+$/i.test(text.trim())

export const buildIssueSearchJql = (query: JiraIssueSearchQuery): string => {
  const clauses: string[] = []
  const text = query.text?.trim()
  if (text) {
    const escaped = escapeJqlString(text)
    if (looksLikeIssueKey(text)) {
      clauses.push(`key = "${escaped.toUpperCase()}"`)
    } else {
      clauses.push(`(summary ~ "${escaped}" OR text ~ "${escaped}")`)
    }
  }
  const projectKey = query.projectKey?.trim()
  if (projectKey) {
    clauses.push(`project = "${escapeJqlString(projectKey)}"`)
  }
  const statusId = query.statusId?.trim()
  if (statusId) {
    clauses.push(
      /^\d+$/.test(statusId)
        ? `status = ${statusId}`
        : `status = "${escapeJqlString(statusId)}"`,
    )
  } else {
    const statusName = query.statusName?.trim()
    if (statusName) {
      clauses.push(`status = "${escapeJqlString(statusName)}"`)
    }
  }
  const assignee = query.assignee?.trim()
  if (assignee === 'unassigned') {
    clauses.push('assignee is EMPTY')
  } else if (assignee) {
    const identityClauses = [`assignee = "${escapeJqlString(assignee)}"`]
    const displayName = query.assigneeDisplayName?.trim()
    if (displayName && displayName !== assignee) {
      identityClauses.push(`assignee = "${escapeJqlString(displayName)}"`)
    }
    clauses.push(
      identityClauses.length === 1
        ? identityClauses[0]
        : `(${identityClauses.join(' OR ')})`,
    )
  }
  if (clauses.length === 0) {
    clauses.push('updated >= -90d')
  }
  return `${clauses.join(' AND ')} ORDER BY updated DESC`
}

const personName = (value: unknown): string | undefined => {
  const record = asRecord(value)
  if (!record) return undefined
  return asString(record.displayName) ?? asString(record.name)
}

const parseIssue = (value: unknown): JiraIssueSearchHit | null => {
  const issue = asRecord(value)
  const key = asString(issue?.key)
  if (!issue || !key) return null
  const fields = asRecord(issue.fields) ?? {}
  const issueType = asRecord(fields.issuetype)
  const status = asRecord(fields.status)
  const statusCategory = asRecord(status?.statusCategory)
  const resolution = asRecord(fields.resolution)
  return {
    key,
    summary: asString(fields.summary) ?? '',
    issueTypeName: asString(issueType?.name) ?? '',
    issueTypeIconUrl: asString(issueType?.iconUrl),
    assigneeName: personName(fields.assignee),
    reporterName: personName(fields.reporter),
    statusName: asString(status?.name) ?? '',
    statusCategory: asString(statusCategory?.key),
    resolution: asString(resolution?.name),
    created: asString(fields.created),
  }
}

const issueTypeIconCache = new Map<string, string | null>()

const resolveJiraResourceUrl = (
  connection: TempoConnection,
  url: string,
): string => {
  try {
    return new URL(url, `${connection.jiraBaseUrl}/`).href
  } catch {
    return url
  }
}

const fetchIssueTypeIcon = async (
  connection: TempoConnection,
  iconUrl: string,
): Promise<string | undefined> => {
  const absoluteUrl = resolveJiraResourceUrl(connection, iconUrl)
  if (issueTypeIconCache.has(absoluteUrl)) {
    return issueTypeIconCache.get(absoluteUrl) ?? undefined
  }

  const authorization = (jiraHeaders(connection) as Record<string, string>)
    .Authorization
  const attempt = async (withAuth: boolean): Promise<string | null> => {
    const response = await fetch(absoluteUrl, {
      method: 'GET',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        ...(withAuth && authorization ? { Authorization: authorization } : {}),
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return null
    const contentType = (response.headers.get('content-type') ?? '').split(
      ';',
    )[0]
    if (
      contentType.includes('text/html') ||
      contentType.includes('application/json') ||
      contentType.includes('text/plain')
    ) {
      return null
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0) return null
    return `data:${contentType || 'image/png'};base64,${bytes.toString('base64')}`
  }

  try {
    const dataUrl = (await attempt(true)) ?? (await attempt(false))
    issueTypeIconCache.set(absoluteUrl, dataUrl)
    return dataUrl ?? undefined
  } catch {
    issueTypeIconCache.set(absoluteUrl, null)
    return undefined
  }
}

const embedIssueTypeIcons = async (
  connection: TempoConnection,
  issues: JiraIssueSearchHit[],
): Promise<JiraIssueSearchHit[]> => {
  const uniqueUrls = [
    ...new Set(
      issues
        .map(issue => issue.issueTypeIconUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ]
  const resolved = new Map<string, string | undefined>()
  await Promise.all(
    uniqueUrls.map(async url => {
      resolved.set(url, await fetchIssueTypeIcon(connection, url))
    }),
  )
  return issues.map(issue => {
    if (!issue.issueTypeIconUrl) return issue
    return {
      ...issue,
      issueTypeIconUrl: resolved.get(issue.issueTypeIconUrl),
    }
  })
}

export const searchJiraIssues = async (
  connection: TempoConnection,
  query: JiraIssueSearchQuery,
): Promise<JiraIssueSearchResult> => {
  const jql = buildIssueSearchJql(query)
  const headers = jiraHeaders(connection)

  if (connection.edition === 'cloud') {
    const body: JsonRecord = {
      jql,
      maxResults: MAX_RESULTS,
      fields: [...ISSUE_FIELDS],
    }
    if (query.nextPageToken?.trim()) {
      body.nextPageToken = query.nextPageToken.trim()
    }
    const response = await requestJson(jiraUrl(connection, '/search/jql'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    requireOk(response, 'Searching Jira issues')
    const record = asRecord(response.body)
    const issues = Array.isArray(record?.issues)
      ? record.issues
          .map(parseIssue)
          .filter((hit): hit is JiraIssueSearchHit => hit !== null)
      : []
    const nextPageToken = asString(record?.nextPageToken)
    const isLast = record?.isLast === true
    return {
      success: true,
      issues: await embedIssueTypeIcons(connection, issues),
      nextPageToken,
      hasMore: Boolean(nextPageToken) && !isLast,
    }
  }

  const startAt = Number.isFinite(query.startAt)
    ? Math.max(0, Number(query.startAt))
    : 0
  const response = await requestJson(jiraUrl(connection, '/search'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jql,
      startAt,
      maxResults: MAX_RESULTS,
      fields: [...ISSUE_FIELDS],
    }),
  })
  requireOk(response, 'Searching Jira issues')
  const record = asRecord(response.body)
  const issues = Array.isArray(record?.issues)
    ? record.issues
        .map(parseIssue)
        .filter((hit): hit is JiraIssueSearchHit => hit !== null)
    : []
  const total =
    typeof record?.total === 'number' && Number.isFinite(record.total)
      ? record.total
      : startAt + issues.length
  return {
    success: true,
    issues: await embedIssueTypeIcons(connection, issues),
    startAt,
    hasMore: startAt + issues.length < total,
  }
}

const parseProject = (value: unknown): JiraIssueProjectOption | null => {
  const record = asRecord(value)
  const key = asString(record?.key)
  const name = asString(record?.name)
  if (!key || !name) return null
  return { key, name }
}

const parseStatus = (value: unknown): JiraIssueStatusOption | null => {
  const record = asRecord(value)
  const id =
    record?.id !== undefined && record.id !== null
      ? String(record.id)
      : undefined
  const name = asString(record?.name)
  if (!id || !name) return null
  return { id, name }
}

const fetchProjects = async (
  connection: TempoConnection,
): Promise<JiraIssueProjectOption[]> => {
  const headers = jiraHeaders(connection)
  if (connection.edition === 'cloud') {
    const { status, body } = await requestJson(
      jiraUrl(connection, '/project/search?maxResults=100&orderBy=name'),
      { method: 'GET', headers },
    )
    if (status >= 200 && status < 300) {
      const record = asRecord(body)
      const values = Array.isArray(record?.values) ? record.values : []
      return values
        .map(parseProject)
        .filter(
          (project): project is JiraIssueProjectOption => project !== null,
        )
    }
  }

  const result = await requestJson(jiraUrl(connection, '/project'), {
    method: 'GET',
    headers,
  })
  requireOk(result, 'Loading Jira projects')
  const list = Array.isArray(result.body) ? result.body : []
  return list
    .map(parseProject)
    .filter((project): project is JiraIssueProjectOption => project !== null)
}

const uniqueStatuses = (items: unknown[]): JiraIssueStatusOption[] => {
  const seen = new Set<string>()
  const statuses: JiraIssueStatusOption[] = []
  for (const item of items) {
    const parsed = parseStatus(item)
    if (!parsed || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    statuses.push(parsed)
  }
  statuses.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
  return statuses
}

const fetchProjectStatuses = async (
  connection: TempoConnection,
  projectKey: string,
): Promise<JiraIssueStatusOption[] | null> => {
  const { status, body } = await requestJson(
    jiraUrl(connection, `/project/${encodeURIComponent(projectKey)}/statuses`),
    { method: 'GET', headers: jiraHeaders(connection) },
  )
  if (status < 200 || status >= 300 || !Array.isArray(body)) return null
  const nested: unknown[] = []
  for (const issueType of body) {
    const record = asRecord(issueType)
    if (Array.isArray(record?.statuses)) nested.push(...record.statuses)
  }
  return uniqueStatuses(nested)
}

const fetchStatuses = async (
  connection: TempoConnection,
  projectKey?: string,
): Promise<JiraIssueStatusOption[]> => {
  const trimmedKey = projectKey?.trim()
  if (trimmedKey) {
    const projectStatuses = await fetchProjectStatuses(connection, trimmedKey)
    if (projectStatuses && projectStatuses.length > 0) return projectStatuses
  }
  const result = await requestJson(jiraUrl(connection, '/status'), {
    method: 'GET',
    headers: jiraHeaders(connection),
  })
  requireOk(result, 'Loading Jira statuses')
  const list = Array.isArray(result.body) ? result.body : []
  return uniqueStatuses(list)
}

export const getJiraIssueFilters = async (
  connection: TempoConnection,
  projectKey?: string,
): Promise<JiraIssueFiltersResult> => {
  const [projects, statuses] = await Promise.all([
    fetchProjects(connection),
    fetchStatuses(connection, projectKey),
  ])
  return { success: true, projects, statuses }
}

const parseUser = (
  value: unknown,
  edition: TempoConnection['edition'],
): JiraUserSearchHit | null => {
  const record = asRecord(value)
  if (!record) return null
  const id =
    edition === 'cloud'
      ? asString(record.accountId)
      : (asString(record.name) ??
        asString(record.key) ??
        asString(record.accountId))
  const displayName = asString(record.displayName) ?? id
  if (!id || !displayName) return null
  return { id, displayName }
}

export const searchJiraUsers = async (
  connection: TempoConnection,
  query: string,
): Promise<JiraUserSearchResult> => {
  const trimmed = query.trim()
  if (!trimmed) {
    return { success: true, users: [] }
  }
  const encoded = encodeURIComponent(trimmed)
  const path =
    connection.edition === 'cloud'
      ? `/user/search?query=${encoded}&maxResults=20`
      : `/user/search?username=${encoded}&maxResults=20`
  const result = await requestJson(jiraUrl(connection, path), {
    method: 'GET',
    headers: jiraHeaders(connection),
  })
  requireOk(result, 'Searching Jira users')
  const list = Array.isArray(result.body) ? result.body : []
  return {
    success: true,
    users: list
      .map(user => parseUser(user, connection.edition))
      .filter((user): user is JiraUserSearchHit => user !== null),
  }
}

export const jiraIssueBrowseUrl = (
  connection: TempoConnection,
  issueKey: string,
): string => {
  const key = issueKey.trim()
  if (!looksLikeIssueKey(key)) {
    throw new TempoApiError(`Invalid issue key: ${issueKey}`, 400)
  }
  return `${connection.jiraBaseUrl}/browse/${encodeURIComponent(key.toUpperCase())}`
}
