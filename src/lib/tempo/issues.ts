import { getCompanyById } from '../../database'
import { getTempoConnection } from '../SyncConfig'
import type { TempoConnection } from '../SyncConfig'
import { TempoApiError } from './client'
import {
  getJiraIssueFilters,
  jiraIssueBrowseUrl,
  searchJiraIssues,
  searchJiraUsers,
} from './jira'

type AppDb = Parameters<typeof getCompanyById>[0]

type ConnectionResult =
  { ok: true; connection: TempoConnection } | { ok: false; error: string }

const resolveCompanyJiraConnection = async (
  db: AppDb,
  companyId: string,
): Promise<ConnectionResult> => {
  const company = await getCompanyById(db, companyId)
  if (!company) {
    return { ok: false, error: 'Company not found' }
  }
  const connectionName = company.tempoConnection?.trim()
  if (!connectionName) {
    return {
      ok: false,
      error: 'This company is not linked to a Tempo connection',
    }
  }
  const connection = await getTempoConnection(connectionName)
  if (!connection) {
    return {
      ok: false,
      error: `Tempo connection "${connectionName}" was not found in sync.yaml`,
    }
  }
  return { ok: true, connection }
}

const asErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof TempoApiError) return error.message
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

export const searchCompanyJiraIssues = async (
  db: AppDb,
  companyId: string,
  query: JiraIssueSearchQuery,
): Promise<JiraIssueSearchResult> => {
  const resolved = await resolveCompanyJiraConnection(db, companyId)
  if (!resolved.ok) {
    return { success: false, error: resolved.error, issues: [] }
  }
  try {
    return await searchJiraIssues(resolved.connection, query)
  } catch (error) {
    return {
      success: false,
      error: asErrorMessage(error, 'Failed to search Jira issues'),
      issues: [],
    }
  }
}

export const getCompanyJiraIssueFilters = async (
  db: AppDb,
  companyId: string,
  projectKey?: string,
): Promise<JiraIssueFiltersResult> => {
  const resolved = await resolveCompanyJiraConnection(db, companyId)
  if (!resolved.ok) {
    return {
      success: false,
      error: resolved.error,
      projects: [],
      statuses: [],
    }
  }
  try {
    return await getJiraIssueFilters(resolved.connection, projectKey)
  } catch (error) {
    return {
      success: false,
      error: asErrorMessage(error, 'Failed to load Jira filters'),
      projects: [],
      statuses: [],
    }
  }
}

export const searchCompanyJiraUsers = async (
  db: AppDb,
  companyId: string,
  query: string,
): Promise<JiraUserSearchResult> => {
  const resolved = await resolveCompanyJiraConnection(db, companyId)
  if (!resolved.ok) {
    return { success: false, error: resolved.error, users: [] }
  }
  try {
    return await searchJiraUsers(resolved.connection, query)
  } catch (error) {
    return {
      success: false,
      error: asErrorMessage(error, 'Failed to search Jira users'),
      users: [],
    }
  }
}

export const getCompanyJiraIssueBrowseUrl = async (
  db: AppDb,
  companyId: string,
  issueKey: string,
): Promise<
  { success: true; url: string } | { success: false; error: string }
> => {
  const resolved = await resolveCompanyJiraConnection(db, companyId)
  if (!resolved.ok) {
    return { success: false, error: resolved.error }
  }
  try {
    return {
      success: true,
      url: jiraIssueBrowseUrl(resolved.connection, issueKey),
    }
  } catch (error) {
    return {
      success: false,
      error: asErrorMessage(error, 'Failed to build Jira issue URL'),
    }
  }
}
