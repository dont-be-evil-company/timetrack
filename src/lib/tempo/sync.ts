import { createHash } from 'node:crypto'
import {
  getCompanyById,
  getTaskExternalSync,
  getTasksByCompany,
  upsertTaskExternalSync,
} from '../../database'
import { getTempoConnection } from '../SyncConfig'
import { createTempoClient, TempoApiError } from './client'

type AppDb = Parameters<typeof getCompanyById>[0]

export const taskContentHash = (
  issueKey: string,
  startDateTime: string,
  endDateTime: string,
  description: string,
): string =>
  createHash('sha256')
    .update([issueKey, startDateTime, endDateTime, description].join('\0'))
    .digest('hex')

const countsFromItems = (
  items: TempoSyncItemResult[],
): Pick<
  TempoSyncResult,
  'created' | 'updated' | 'skipped' | 'unchanged' | 'failed'
> => ({
  created: items.filter(i => i.status === 'created').length,
  updated: items.filter(i => i.status === 'updated').length,
  skipped: items.filter(i => i.status === 'skipped').length,
  unchanged: items.filter(i => i.status === 'unchanged').length,
  failed: items.filter(i => i.status === 'failed').length,
})

export const syncCompanyToTempo = async (
  db: AppDb,
  companyId: string,
  activeTaskIds: Set<string>,
): Promise<TempoSyncResult> => {
  const company = await getCompanyById(db, companyId)
  if (!company) {
    return {
      success: false,
      error: 'Company not found',
      created: 0,
      updated: 0,
      skipped: 0,
      unchanged: 0,
      failed: 0,
      items: [],
    }
  }

  const connectionName = company.tempoConnection?.trim()
  if (!connectionName) {
    return {
      success: false,
      error: 'This company is not linked to a Tempo connection',
      created: 0,
      updated: 0,
      skipped: 0,
      unchanged: 0,
      failed: 0,
      items: [],
    }
  }

  const connection = await getTempoConnection(connectionName)
  if (!connection) {
    return {
      success: false,
      error: `Tempo connection "${connectionName}" was not found in sync.yaml`,
      created: 0,
      updated: 0,
      skipped: 0,
      unchanged: 0,
      failed: 0,
      items: [],
    }
  }

  const client = createTempoClient(connection)
  const issueIdCache = new Map<string, string>()
  const items: TempoSyncItemResult[] = []
  const tasks = await getTasksByCompany(db, companyId)

  const resolveIssueId = async (issueKey: string): Promise<string> => {
    const cached = issueIdCache.get(issueKey)
    if (cached) return cached
    const issueId = await client.resolveIssueId(issueKey)
    issueIdCache.set(issueKey, issueId)
    return issueId
  }

  for (const task of tasks) {
    const issueKey = task.issueKey?.trim()
    const startDateTime = task.startDateTime || ''
    const endDateTime = task.endDateTime || startDateTime
    const description = task.description?.trim() || task.name

    if (task.status && task.status !== 'active') {
      items.push({
        taskId: task.id,
        taskName: task.name,
        issueKey,
        status: 'skipped',
        message: 'Inactive task',
      })
      continue
    }

    if (activeTaskIds.has(task.id)) {
      items.push({
        taskId: task.id,
        taskName: task.name,
        issueKey,
        status: 'skipped',
        message: 'Timer is still running',
      })
      continue
    }

    if (task.seconds <= 0) {
      items.push({
        taskId: task.id,
        taskName: task.name,
        issueKey,
        status: 'skipped',
        message: 'Zero duration',
      })
      continue
    }

    if (!issueKey) {
      items.push({
        taskId: task.id,
        taskName: task.name,
        status: 'skipped',
        message: 'No issue key',
      })
      continue
    }

    const contentHash = taskContentHash(
      issueKey,
      startDateTime,
      endDateTime,
      description,
    )
    const existing = await getTaskExternalSync(db, task.id)
    const sameConnection = existing?.connectionName === connectionName

    if (sameConnection && existing.contentHash === contentHash) {
      items.push({
        taskId: task.id,
        taskName: task.name,
        issueKey,
        status: 'unchanged',
        message: 'Unchanged since last sync',
      })
      continue
    }

    try {
      const issueId = await resolveIssueId(issueKey)
      const input = {
        issueKey,
        issueId,
        timeSpentSeconds: task.seconds,
        startDateTime,
        description,
      }

      const canUpdate =
        sameConnection &&
        Boolean(existing?.remoteId) &&
        (!existing.remoteIssueId || existing.remoteIssueId === issueId)

      if (canUpdate && existing) {
        await client.updateWorklog(existing.remoteId, input)
        await upsertTaskExternalSync(db, {
          taskId: task.id,
          connectionName,
          remoteId: existing.remoteId,
          remoteIssueId: issueId,
          contentHash,
        })
        items.push({
          taskId: task.id,
          taskName: task.name,
          issueKey,
          status: 'updated',
        })
      } else {
        const remoteId = await client.createWorklog(input)
        await upsertTaskExternalSync(db, {
          taskId: task.id,
          connectionName,
          remoteId,
          remoteIssueId: issueId,
          contentHash,
        })
        items.push({
          taskId: task.id,
          taskName: task.name,
          issueKey,
          status: 'created',
        })
      }
    } catch (error) {
      const message =
        error instanceof TempoApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unknown error'
      items.push({
        taskId: task.id,
        taskName: task.name,
        issueKey,
        status: 'failed',
        message,
      })
      if (error instanceof TempoApiError && error.status === 401) {
        break
      }
    }
  }

  const counts = countsFromItems(items)
  return {
    success: counts.failed === 0,
    ...counts,
    items,
  }
}
