import { app } from 'electron'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { alias } from 'drizzle-orm/sqlite-core'
import logger from 'node-color-log'
import fs from 'fs'
import path from 'path'
import { getDBFilePath } from './lib/ConfigFile'
import {
  company,
  project,
  status,
  task,
  taskAttachment,
  taskDefinition,
  taskExternalSync,
} from './db/schema'
import { and, eq, inArray, like, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'

// Helper function to convert date string (YYYY-MM-DD) to ISO date string (YYYY-MM-DDTHH:mm:ss.sssZ)
const dateStringToISO = (dateStr: string): string => {
  // If already in ISO format, return as is
  if (dateStr.includes('T')) {
    return dateStr
  }
  // Convert YYYY-MM-DD to ISO format
  const dateParts = dateStr.split('-')
  const date = new Date(
    Date.UTC(
      parseInt(dateParts[0]),
      parseInt(dateParts[1]) - 1,
      parseInt(dateParts[2]),
      0,
      0,
      0,
      0,
    ),
  )
  return date.toISOString()
}

// Helper function to normalize date string for comparison
const normalizeDateString = (dateStr: string): string => {
  if (dateStr.includes('T')) {
    // ISO-like format, extract date part
    return dateStr.split('T')[0]
  }
  if (dateStr.includes(' ')) {
    // SQLite DATETIME 'YYYY-MM-DD HH:MM:SS'
    return dateStr.split(' ')[0]
  }
  return dateStr
}

type TaskQueryRow = {
  id: number
  taskDefinitionId: number
  description: string | null
  startDateTime: string | Date
  endDateTime: string | Date
  status: string
  taskDefinitionName: string
  projectName: string
  companyName: string
  issueKey: string | null
  durationSeconds?: number | null
}

const emptyToNull = (value?: string | null): string | null => {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const mapTaskRow = (t: TaskQueryRow): DBTask => {
  const start =
    typeof t.startDateTime === 'string'
      ? t.startDateTime
      : (t.startDateTime as Date).toISOString()
  const end =
    typeof t.endDateTime === 'string'
      ? t.endDateTime
      : (t.endDateTime as Date).toISOString()
  const dateStr = normalizeDateString(start)
  const seconds =
    t.durationSeconds != null
      ? Math.max(0, t.durationSeconds)
      : Math.max(
          0,
          Math.floor(
            (new Date(end).getTime() - new Date(start).getTime()) / 1000,
          ),
        )

  return {
    id: t.id.toString(),
    name: t.taskDefinitionName,
    taskDefinitionId: t.taskDefinitionId.toString(),
    projectName: t.projectName,
    companyName: t.companyName,
    description: t.description || '',
    seconds,
    date: dateStr,
    status: t.status,
    startDateTime: start,
    endDateTime: end,
    issueKey: t.issueKey || undefined,
  }
}

let db: ReturnType<typeof drizzle> | null = null
let dbFilePathOverride: string | null = null

type Task = {
  taskId: string
  date: string
  seconds: number
}

export const getDatabase = async () => {
  if (!db) {
    await initDB()
  }
  return db!
}

/**
 * Configure the database file path to be used for this application run.
 * Must be called before the first call to `initDB` / `getDatabase`.
 */
export const setDatabaseFilePath = (filePath: string) => {
  if (db) {
    logger.warn(
      '⚠️ Database file path override was set after initialization; ignoring.',
    )
    return
  }
  dbFilePathOverride = filePath
}

// Helper function to get or create status
const getOrCreateStatus = async (
  db: ReturnType<typeof drizzle>,
  statusName: string,
): Promise<number> => {
  const existingStatus = await db
    .select()
    .from(status)
    .where(eq(status.name, statusName))
    .limit(1)

  if (existingStatus.length > 0) {
    return existingStatus[0].id
  }

  const result = await db
    .insert(status)
    .values({ name: statusName })
    .returning({ id: status.id })

  return result[0].id
}

const initDB = async () => {
  const sqlFilePath = dbFilePathOverride ?? (await getDBFilePath())

  logger.info('🗃️ Initializing database with Drizzle...')

  // Ensure the database directory exists so libsql can create the file on first use
  const dbDir = path.dirname(sqlFilePath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // Create raw libsql client (file is created automatically on first statement if missing)
  const client = createClient({ url: `file:${sqlFilePath}` })

  // Create Drizzle instance
  db = drizzle(client)

  // Run migrations programmatically
  try {
    // Determine migrations folder path
    // should be in asar unpacked resources if packaged with Electron
    // during development, it can be relative to the project root
    // so we check for is development mode first
    const migrationsPath = !app.isPackaged
      ? path.join(__dirname, '..', '..', 'drizzle')
      : path.join(process.resourcesPath, 'app.asar.unpacked', 'drizzle')

    // Check if migrations folder exists
    if (fs.existsSync(migrationsPath)) {
      logger.info('🗃️ Running database migrations...')
      logger.info(`🗃️ Migrations folder: ${migrationsPath}`)

      try {
        await client.execute('PRAGMA foreign_keys = OFF;')
        await migrate(db, {
          migrationsFolder: migrationsPath,
        })
      } catch (migrateErr: unknown) {
        logger.error('🗃️ Migration error details:', migrateErr)
        throw migrateErr
      }
      await client.execute('PRAGMA foreign_keys = ON;')

      logger.info('🗃️ Database migrations completed')
    } else {
      logger.warn(
        '⚠️ No migrations folder found. Please ensure migrations are set up.',
        migrationsPath,
      )
    }
  } catch (migrateError) {
    logger.error('📢 Migration error:', migrateError)
    throw migrateError
  }

  try {
    // Initialize default statuses if they don't exist
    await getOrCreateStatus(db, 'active')
    await getOrCreateStatus(db, 'inactive')
    logger.info('🗃️ Default statuses initialized')
  } catch (statusError) {
    logger.warn(
      '⚠️ Error initializing default statuses (they may already exist):',
      statusError,
    )
    // Don't throw - statuses might already exist from a previous run
  }

  logger.info('🗃️ Database connected successfully')
  return db
}

const getTaskByTaskDefinitionAndDate = async (
  db: ReturnType<typeof drizzle>,
  taskDefinitionId: string,
  date: string,
): Promise<DBTask | null> => {
  const targetDateISO = dateStringToISO(date)
  const targetDateNormalized = normalizeDateString(targetDateISO)

  const result = await db
    .select({
      id: task.id,
      taskDefinitionId: task.taskDefinitionId,
      description: task.description,
      startDateTime: task.startDateTime,
      endDateTime: task.endDateTime,
      status: status.name,
      taskDefinitionName: taskDefinition.name,
      projectName: project.name,
      companyName: company.name,
      issueKey: task.issueKey,
    })
    .from(task)
    .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
    .innerJoin(project, eq(taskDefinition.projectId, project.id))
    .innerJoin(status, eq(task.statusId, status.id))
    .innerJoin(company, eq(project.companyId, company.id))
    .where(
      and(
        eq(task.taskDefinitionId, parseInt(taskDefinitionId)),
        sql`DATE(${task.startDateTime}) = DATE(${sql.raw(
          `'${targetDateNormalized}'`,
        )})`,
      ),
    )
    .limit(1)

  if (result.length === 0) {
    return null
  }

  return mapTaskRow(result[0])
}

const getTaskById = async (
  db: ReturnType<typeof drizzle>,
  taskId: string,
): Promise<DBTask | null> => {
  const result = await db
    .select({
      id: task.id,
      taskDefinitionId: task.taskDefinitionId,
      description: task.description,
      startDateTime: task.startDateTime,
      endDateTime: task.endDateTime,
      status: status.name,
      taskDefinitionName: taskDefinition.name,
      projectName: project.name,
      companyName: company.name,
      issueKey: task.issueKey,
    })
    .from(task)
    .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
    .innerJoin(project, eq(taskDefinition.projectId, project.id))
    .innerJoin(company, eq(project.companyId, company.id))
    .innerJoin(status, eq(task.statusId, status.id))
    .where(eq(task.id, parseInt(taskId, 10)))
    .limit(1)

  if (result.length === 0) {
    return null
  }

  return mapTaskRow(result[0])
}

const getSearchResult = async (
  db: ReturnType<typeof drizzle>,
  q: SearchQuery,
): Promise<SearchQueryResult> => {
  const project_name = q.task.project_name.replace(/\*/g, '%')
  const task_name = q.task.task_name.replace(/\*/g, '%')
  const task_description = q.task.task_description.replace(/\*/g, '%')
  const task_definition_name = q.task.task_definition_name.replace(/\*/g, '%')
  const company_name = q.task.company_name.replace(/\*/g, '%')
  const attachment_filename = (q.task.attachment_filename || '*').replace(
    /\*/g,
    '%',
  )

  const results: SearchQueryResult = {
    companies: [],
    projects: [],
    task_definitions: [],
    tasks: [],
    attachments: [],
  }

  // Filter by status if specified
  let statusId: number | undefined
  if (q.active_state === 'active' || q.active_state === 'inactive') {
    const statusResult = await db
      .select()
      .from(status)
      .where(eq(status.name, q.active_state))
      .limit(1)
    statusId = statusResult[0]?.id
  }

  if (q.search_in.includes('companies')) {
    let query = db
      .select({
        id: company.id,
        name: company.name,
        status: status.name,
        tempoConnection: company.tempoConnection,
      })
      .from(company)
      .innerJoin(status, eq(company.statusId, status.id))

    if (company_name !== '%' && company_name !== '*') {
      // Use exact match when a specific company is selected
      query = query.where(
        eq(company.name, company_name.replace(/%/g, '')),
      ) as unknown as typeof query
    }

    if (statusId) {
      query = query.where(
        eq(company.statusId, statusId),
      ) as unknown as typeof query
    }

    const companies = await query
    results.companies = companies.map(c => ({
      id: c.id.toString(),
      name: c.name,
      status: c.status,
      tempoConnection: c.tempoConnection || undefined,
    }))
  }

  if (q.search_in.includes('projects')) {
    let query = db
      .select({
        id: project.id,
        name: project.name,
        companyId: project.companyId,
        companyName: company.name,
        status: status.name,
      })
      .from(project)
      .innerJoin(company, eq(project.companyId, company.id))
      .innerJoin(status, eq(project.statusId, status.id))

    const conditions = []
    if (project_name !== '%' && project_name !== '*') {
      conditions.push(like(project.name, `%${project_name.replace(/%/g, '')}%`))
    }
    if (company_name !== '%' && company_name !== '*') {
      // Use exact match when a specific company is selected
      conditions.push(eq(company.name, company_name.replace(/%/g, '')))
    }
    if (statusId) {
      conditions.push(eq(project.statusId, statusId))
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as unknown as typeof query
    }

    const projects = await query
    results.projects = projects.map(p => ({
      id: p.id.toString(),
      name: p.name,
      companyId: p.companyId.toString(),
      companyName: p.companyName,
      company: { id: p.companyId.toString(), name: p.companyName },
      status: p.status,
    }))
  }

  if (q.search_in.includes('task_definitions')) {
    const conditions = []
    if (task_definition_name !== '%' && task_definition_name !== '*') {
      conditions.push(
        like(
          taskDefinition.name,
          `%${task_definition_name.replace(/%/g, '')}%`,
        ),
      )
    }
    if (project_name !== '%' && project_name !== '*') {
      conditions.push(like(project.name, `%${project_name.replace(/%/g, '')}%`))
    }
    if (statusId) {
      conditions.push(eq(taskDefinition.statusId, statusId))
    }

    let query = db
      .select({
        id: taskDefinition.id,
        name: taskDefinition.name,
        projectId: taskDefinition.projectId,
        projectName: project.name,
        status: status.name,
        issueKey: taskDefinition.issueKey,
      })
      .from(taskDefinition)
      .innerJoin(project, eq(taskDefinition.projectId, project.id))
      .innerJoin(status, eq(taskDefinition.statusId, status.id))

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as unknown as typeof query
    }

    const taskDefs = await query
    results.task_definitions = taskDefs.map(td => ({
      id: td.id.toString(),
      name: td.name,
      projectId: td.projectId.toString(),
      projectName: td.projectName,
      status: td.status,
      issueKey: td.issueKey || undefined,
    }))
  }

  if (q.search_in.includes('tasks')) {
    // Convert date strings to ISO format for comparison
    const fromDateISO = dateStringToISO(q.from_date)
    const toDateISO = dateStringToISO(q.to_date)

    // Compare only the DATE(startDateTime) part
    const conditions = [
      sql`DATE(${task.startDateTime}) >= DATE(${sql.raw(
        `'${normalizeDateString(fromDateISO)}'`,
      )})`,
      sql`DATE(${task.startDateTime}) <= DATE(${sql.raw(
        `'${normalizeDateString(toDateISO)}'`,
      )})`,
    ]

    // Only add filters if they're not wildcards
    if (task_name !== '%' && task_name !== '*') {
      conditions.push(
        like(taskDefinition.name, `%${task_name.replace(/%/g, '')}%`),
      )
    }
    if (project_name !== '%' && project_name !== '*') {
      conditions.push(like(project.name, `%${project_name.replace(/%/g, '')}%`))
    }
    if (company_name !== '%' && company_name !== '*') {
      // Use exact match when a specific company is selected
      conditions.push(eq(company.name, company_name.replace(/%/g, '')))
    }
    if (task_definition_name !== '%' && task_definition_name !== '*') {
      conditions.push(
        like(
          taskDefinition.name,
          `%${task_definition_name.replace(/%/g, '')}%`,
        ),
      )
    }
    if (task_description !== '%' && task_description !== '*') {
      conditions.push(
        like(task.description, `%${task_description.replace(/%/g, '')}%`),
      )
    }
    // Only filter by status if explicitly set to 'active' or 'inactive'
    // 'all' means don't filter by status
    if (statusId !== undefined) {
      conditions.push(eq(task.statusId, statusId))
    }
    if (attachment_filename !== '%' && attachment_filename !== '*') {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM TaskAttachment
          WHERE TaskAttachment.taskId = ${task.id}
          AND TaskAttachment.filename LIKE ${
            '%' + attachment_filename.replace(/%/g, '') + '%'
          }
        )`,
      )
    }

    const tasks = await db
      .select({
        id: task.id,
        taskDefinitionId: task.taskDefinitionId,
        description: task.description,
        startDateTime: task.startDateTime,
        endDateTime: task.endDateTime,
        // Duration in seconds computed in SQLite to avoid JS date parsing issues
        durationSeconds: sql<number>`CAST((julianday(${task.endDateTime}) - julianday(${task.startDateTime})) * 86400 AS INTEGER)`,
        status: status.name,
        taskDefinitionName: taskDefinition.name,
        projectName: project.name,
        companyName: company.name,
        issueKey: task.issueKey,
      })
      .from(task)
      .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
      .innerJoin(project, eq(taskDefinition.projectId, project.id))
      .innerJoin(status, eq(task.statusId, status.id))
      .innerJoin(company, eq(project.companyId, company.id))
      .where(and(...conditions))
      .orderBy(sql`${task.startDateTime} ASC`)

    const taskIds = tasks.map(t => t.id)
    const matchingAttachmentsByTask = new Map<number, string[]>()
    if (taskIds.length > 0) {
      const attachmentConditions = [inArray(taskAttachment.taskId, taskIds)]
      if (attachment_filename !== '%' && attachment_filename !== '*') {
        attachmentConditions.push(
          like(
            taskAttachment.filename,
            `%${attachment_filename.replace(/%/g, '')}%`,
          ),
        )
      }
      const attachmentRows = await db
        .select({
          taskId: taskAttachment.taskId,
          filename: taskAttachment.filename,
        })
        .from(taskAttachment)
        .where(and(...attachmentConditions))
        .orderBy(taskAttachment.filename)

      for (const row of attachmentRows) {
        const list = matchingAttachmentsByTask.get(row.taskId) || []
        list.push(row.filename)
        matchingAttachmentsByTask.set(row.taskId, list)
      }
    }

    results.tasks = tasks.map(t => ({
      ...mapTaskRow(t),
      attachmentFilenames: matchingAttachmentsByTask.get(t.id) || [],
    }))
  }

  if (q.search_in.includes('attachments')) {
    const fromDateISO = dateStringToISO(q.from_date)
    const toDateISO = dateStringToISO(q.to_date)

    const conditions = [
      sql`DATE(${task.startDateTime}) >= DATE(${sql.raw(
        `'${normalizeDateString(fromDateISO)}'`,
      )})`,
      sql`DATE(${task.startDateTime}) <= DATE(${sql.raw(
        `'${normalizeDateString(toDateISO)}'`,
      )})`,
    ]

    if (task_name !== '%' && task_name !== '*') {
      conditions.push(
        like(taskDefinition.name, `%${task_name.replace(/%/g, '')}%`),
      )
    }
    if (project_name !== '%' && project_name !== '*') {
      conditions.push(like(project.name, `%${project_name.replace(/%/g, '')}%`))
    }
    if (company_name !== '%' && company_name !== '*') {
      conditions.push(eq(company.name, company_name.replace(/%/g, '')))
    }
    if (task_definition_name !== '%' && task_definition_name !== '*') {
      conditions.push(
        like(
          taskDefinition.name,
          `%${task_definition_name.replace(/%/g, '')}%`,
        ),
      )
    }
    if (task_description !== '%' && task_description !== '*') {
      conditions.push(
        like(task.description, `%${task_description.replace(/%/g, '')}%`),
      )
    }
    if (attachment_filename !== '%' && attachment_filename !== '*') {
      conditions.push(
        like(
          taskAttachment.filename,
          `%${attachment_filename.replace(/%/g, '')}%`,
        ),
      )
    }
    if (statusId !== undefined) {
      conditions.push(eq(task.statusId, statusId))
    }

    const attachments = await db
      .select({
        id: taskAttachment.id,
        filename: taskAttachment.filename,
        mimeType: taskAttachment.mimeType,
        size: taskAttachment.size,
        taskId: taskAttachment.taskId,
        taskDefinitionId: task.taskDefinitionId,
        startDateTime: task.startDateTime,
        endDateTime: task.endDateTime,
        durationSeconds: sql<number>`CAST((julianday(${task.endDateTime}) - julianday(${task.startDateTime})) * 86400 AS INTEGER)`,
        status: status.name,
        taskDefinitionName: taskDefinition.name,
        projectName: project.name,
        companyName: company.name,
        description: task.description,
      })
      .from(taskAttachment)
      .innerJoin(task, eq(taskAttachment.taskId, task.id))
      .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
      .innerJoin(project, eq(taskDefinition.projectId, project.id))
      .innerJoin(status, eq(task.statusId, status.id))
      .innerJoin(company, eq(project.companyId, company.id))
      .where(and(...conditions))
      .orderBy(taskAttachment.filename)

    results.attachments = attachments.map(a => {
      const start =
        typeof a.startDateTime === 'string'
          ? a.startDateTime
          : (a.startDateTime as Date).toISOString()
      return {
        id: a.id.toString(),
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        taskId: a.taskId.toString(),
        taskName: a.taskDefinitionName,
        taskDefinitionId: a.taskDefinitionId.toString(),
        projectName: a.projectName,
        companyName: a.companyName,
        date: normalizeDateString(start),
        description: a.description || '',
        seconds: Math.max(0, a.durationSeconds ?? 0),
        status: a.status,
        startDateTime: start,
      }
    })
  }

  return results
}

const getDataForPDFExport = async (
  db: ReturnType<typeof drizzle>,
  q: PDFQuery,
): Promise<PDFQueryResult[]> => {
  // Convert date strings to ISO format for comparison
  const fromDateISO = dateStringToISO(q.from)
  const toDateISO = dateStringToISO(q.to)
  const fromDateNormalized = normalizeDateString(fromDateISO)
  const toDateNormalized = normalizeDateString(toDateISO)

  logger.info(
    `PDF Export query: from=${q.from}, to=${q.to}, tasks=${JSON.stringify(
      q.tasks,
    )}`,
  )
  logger.info(
    `PDF Export date range: ${fromDateNormalized} to ${toDateNormalized}`,
  )

  // Find all matching task definitions
  const taskDefIds: number[] = []
  for (const taskQuery of q.tasks) {
    const projectResult = await db
      .select()
      .from(project)
      .where(eq(project.name, taskQuery.project_name))
      .limit(1)

    if (projectResult.length === 0) {
      continue
    }

    const taskDefResult = await db
      .select()
      .from(taskDefinition)
      .where(
        and(
          eq(taskDefinition.name, taskQuery.name),
          eq(taskDefinition.projectId, projectResult[0].id),
        ),
      )
      .limit(1)

    if (taskDefResult.length > 0) {
      taskDefIds.push(taskDefResult[0].id)
    }
  }

  logger.info(
    `Task definition IDs:`,
    taskDefIds.map(id => id.toString()),
  )

  if (taskDefIds.length === 0) {
    return []
  }

  const res = await db
    .select({
      id: task.id,
      name: taskDefinition.name,
      projectName: project.name,
      companyName: company.name,
      startDateTime: task.startDateTime,
      endDateTime: task.endDateTime,
      description: task.description,
      durationSeconds: sql<number>`CAST((julianday(${task.endDateTime}) - julianday(${task.startDateTime})) * 86400 AS INTEGER)`,
    })
    .from(task)
    .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
    .innerJoin(project, eq(taskDefinition.projectId, project.id))
    .innerJoin(company, eq(project.companyId, company.id))
    .where(
      and(
        sql`DATE(${task.startDateTime}) >= DATE(${sql.raw(
          `'${fromDateNormalized}'`,
        )})`,
        sql`DATE(${task.startDateTime}) <= DATE(${sql.raw(
          `'${toDateNormalized}'`,
        )})`,
        inArray(task.taskDefinitionId, taskDefIds),
      ),
    )

  logger.info(`PDF Export found ${res.length} tasks matching criteria`)

  return res.map(t => {
    const start =
      typeof t.startDateTime === 'string'
        ? t.startDateTime
        : (t.startDateTime as Date).toISOString()
    const dateStr = normalizeDateString(start)
    const seconds = Math.max(0, t.durationSeconds ?? 0)

    return {
      id: t.id,
      name: t.name,
      projectName: t.projectName,
      companyName: t.companyName,
      date: dateStr,
      description: t.description || '',
      seconds,
    }
  })
}

const saveActiveTask = async (
  db: ReturnType<typeof drizzle>,
  taskData: Task,
) => {
  // Persist active time by adjusting endDateTime = startDateTime + seconds
  await db
    .update(task)
    .set({
      endDateTime: sql`datetime(${task.startDateTime}, printf('+%d seconds', ${taskData.seconds}))`,
    })
    .where(eq(task.id, parseInt(taskData.taskId, 10)))
}

const saveActiveTasks = async (
  db: ReturnType<typeof drizzle>,
  tasks: Task[],
) => {
  await Promise.all(
    tasks.map(async taskData => {
      await db
        .update(task)
        .set({
          endDateTime: sql`datetime(${task.startDateTime}, printf('+%d seconds', ${taskData.seconds}))`,
        })
        .where(eq(task.id, parseInt(taskData.taskId)))
    }),
  )
}

const getCompanyByName = async (
  db: ReturnType<typeof drizzle>,
  name: string,
): Promise<DBCompany | null> => {
  const result = await db
    .select({
      id: company.id,
      name: company.name,
      status: status.name,
      tempoConnection: company.tempoConnection,
    })
    .from(company)
    .innerJoin(status, eq(company.statusId, status.id))
    .where(eq(company.name, name))
    .limit(1)
  if (result.length === 0) {
    return null
  }
  const c = result[0]
  return {
    id: c.id.toString(),
    name: c.name,
    status: c.status,
    tempoConnection: c.tempoConnection || undefined,
  }
}

const getCompanyById = async (
  db: ReturnType<typeof drizzle>,
  companyId: string,
): Promise<DBCompany | null> => {
  const result = await db
    .select({
      id: company.id,
      name: company.name,
      status: status.name,
      tempoConnection: company.tempoConnection,
    })
    .from(company)
    .innerJoin(status, eq(company.statusId, status.id))
    .where(eq(company.id, parseInt(companyId)))
    .limit(1)
  if (result.length === 0) {
    return null
  }
  const c = result[0]
  return {
    id: c.id.toString(),
    name: c.name,
    status: c.status,
    tempoConnection: c.tempoConnection || undefined,
  }
}

// Company functions
const getCompanies = async (
  db: ReturnType<typeof drizzle>,
  statusName?: string,
): Promise<DBCompany[]> => {
  const statusId = await getOrCreateStatus(db, statusName || 'active')
  const companies = await db
    .select({
      id: company.id,
      name: company.name,
      status: status.name,
      tempoConnection: company.tempoConnection,
    })
    .from(company)
    .innerJoin(status, eq(company.statusId, status.id))
    .where(eq(company.statusId, statusId))

  return companies.map(c => ({
    id: c.id.toString(),
    name: c.name,
    status: c.status,
    tempoConnection: c.tempoConnection || undefined,
  }))
}

const addCompany = async (
  db: ReturnType<typeof drizzle>,
  name: string,
): Promise<{ success: true; company: DBCompany } | { success: false }> => {
  const existingCompany = await getCompanyByName(db, name)
  const activeStatusId = await getOrCreateStatus(db, 'active')
  if (existingCompany) {
    if (existingCompany.statusId !== activeStatusId) {
      await db
        .update(company)
        .set({ statusId: activeStatusId })
        .where(and(eq(company.id, parseInt(existingCompany.id))))
      existingCompany.status = 'active'
      existingCompany.statusId = activeStatusId
    }
    return { success: true, company: existingCompany }
  }
  const result = await db
    .insert(company)
    .values({
      name,
      statusId: activeStatusId,
    })
    .returning({ id: company.id, name: company.name })

  return {
    success: true,
    company: { id: result[0].id.toString(), name: result[0].name },
  }
}

const mergeCompanies = async (
  db: ReturnType<typeof drizzle>,
  sourceCompanyId: string,
  targetCompanyId: string,
): Promise<{ success: true }> => {
  // We need to update all projects that belong to the source company
  // to belong to the target company first
  await db
    .update(project)
    .set({ companyId: parseInt(targetCompanyId) })
    .where(eq(project.companyId, parseInt(sourceCompanyId)))
  // Now we can delete the source company
  await db.delete(company).where(eq(company.id, parseInt(sourceCompanyId)))
  return { success: true }
}

const editCompany = async (
  db: ReturnType<typeof drizzle>,
  opts: DBEditCompanyOpts,
) => {
  const updateData: {
    name: string
    statusId?: number
    tempoConnection?: string | null
  } = { name: opts.name }
  if (opts.status !== undefined) {
    const statusId = await getOrCreateStatus(db, opts.status)
    updateData.statusId = statusId
  }
  if (opts.tempoConnection !== undefined) {
    updateData.tempoConnection = emptyToNull(opts.tempoConnection)
  }

  await db
    .update(company)
    .set(updateData)
    .where(eq(company.id, parseInt(opts.id)))

  return { success: true }
}

const deleteCompany = async (db: ReturnType<typeof drizzle>, id: string) => {
  await db.delete(company).where(eq(company.id, parseInt(id)))
  return { success: true }
}

// Project functions
const getProjects = async (
  db: ReturnType<typeof drizzle>,
  companyId?: string,
  statusName?: string,
): Promise<DBProject[]> => {
  statusName = statusName || 'active'
  const statusId = await getOrCreateStatus(db, statusName)
  const query = db
    .select({
      id: project.id,
      name: project.name,
      companyId: project.companyId,
      companyName: company.name,
      status: status.name,
    })
    .from(project)
    .innerJoin(company, eq(project.companyId, company.id))
    .innerJoin(status, eq(project.statusId, status.id))
    .where(
      companyId
        ? and(eq(project.statusId, statusId), eq(project.statusId, statusId))
        : eq(project.statusId, statusId),
    )

  const projects = await query
  return projects.map(p => ({
    id: p.id.toString(),
    name: p.name,
    companyId: p.companyId.toString(),
    companyName: p.companyName,
    company: { id: p.companyId.toString(), name: p.companyName },
    status: p.status,
  }))
}

const getProjectByName = async (
  db: ReturnType<typeof drizzle>,
  name: string,
  companyId: string,
): Promise<DBProject | null> => {
  const result = await db
    .select({
      id: project.id,
      name: project.name,
      companyId: project.companyId,
      companyName: company.name,
      status: status.name,
      statusId: project.statusId,
    })
    .from(project)
    .innerJoin(company, eq(project.companyId, company.id))
    .innerJoin(status, eq(project.statusId, status.id))
    .where(
      and(eq(project.name, name), eq(project.companyId, parseInt(companyId))),
    )
    .limit(1)
  if (result.length === 0) {
    return null
  }
  const p = result[0]
  return {
    id: p.id.toString(),
    name: p.name,
    companyId: p.companyId.toString(),
    companyName: p.companyName,
    company: { id: p.companyId.toString(), name: p.companyName },
    status: p.status,
  }
}

const getProjectById = async (
  db: ReturnType<typeof drizzle>,
  projectId: string,
): Promise<DBProject | null> => {
  const result = await db
    .select({
      id: project.id,
      name: project.name,
      companyId: project.companyId,
      companyName: company.name,
      status: status.name,
    })
    .from(project)
    .innerJoin(company, eq(project.companyId, company.id))
    .innerJoin(status, eq(project.statusId, status.id))
    .where(eq(project.id, parseInt(projectId)))
    .limit(1)
  if (result.length === 0) {
    return null
  }
  const p = result[0]
  return {
    id: p.id.toString(),
    name: p.name,
    companyId: p.companyId.toString(),
    companyName: p.companyName,
    company: { id: p.companyId.toString(), name: p.companyName },
    status: p.status,
  }
}

const addProject = async (
  db: ReturnType<typeof drizzle>,
  name: string,
  companyId: string,
): Promise<{ success: true; project: DBProject } | { success: false }> => {
  const existingProject = await getProjectByName(db, name, companyId)
  const activeStatusId = await getOrCreateStatus(db, 'active')
  if (existingProject) {
    if (existingProject.statusId !== activeStatusId) {
      await db
        .update(project)
        .set({ statusId: activeStatusId })
        .where(and(eq(project.id, parseInt(existingProject.id))))
      existingProject.status = 'active'
      existingProject.statusId = activeStatusId
    }
    return { success: true, project: existingProject }
  }
  const result = await db
    .insert(project)
    .values({
      name,
      companyId: parseInt(companyId),
      statusId: activeStatusId,
    })
    .returning({
      id: project.id,
      name: project.name,
    })
  const company = await getCompanyById(db, companyId)

  if (!company) {
    return { success: false }
  }

  return {
    success: true,
    project: {
      id: result[0].id.toString(),
      name: result[0].name,
      companyName: company.name,
      companyId: companyId,
      company: { id: companyId, name: company.name },
    },
  }
}

const mergeProjects = async (
  db: ReturnType<typeof drizzle>,
  sourceProjectId: string,
  targetProjectId: string,
): Promise<{ success: true }> => {
  const existingTaskDefsInTarget = await db
    .select()
    .from(taskDefinition)
    .where(
      and(
        eq(taskDefinition.projectId, parseInt(targetProjectId)),
        inArray(
          taskDefinition.name,
          db
            .select({ name: taskDefinition.name })
            .from(taskDefinition)
            .where(eq(taskDefinition.projectId, parseInt(sourceProjectId))),
        ),
      ),
    )
  for (const existingTD of existingTaskDefsInTarget) {
    const sourceTD = await db
      .select()
      .from(taskDefinition)
      .where(and(eq(taskDefinition.projectId, parseInt(sourceProjectId))))
      .limit(1)
    if (sourceTD.length > 0) {
      await mergeTaskDefinitions(
        db,
        sourceTD[0].id.toString(),
        existingTD.id.toString(),
      )
    }
  }

  // Now we can delete the source project
  await db.delete(project).where(eq(project.id, parseInt(sourceProjectId)))
  return { success: true }
}

const editProject = async (
  db: ReturnType<typeof drizzle>,
  opts: DBEditProjectOpts,
) => {
  const updateData: {
    name: string
    companyId: number
    statusId?: number
  } = {
    name: opts.name,
    companyId: parseInt(opts.companyId),
  }
  if (opts.status !== undefined) {
    const statusId = await getOrCreateStatus(db, opts.status)
    updateData.statusId = statusId
  }

  await db
    .update(project)
    .set(updateData)
    .where(eq(project.id, parseInt(opts.id)))

  return { success: true }
}

const deleteProject = async (db: ReturnType<typeof drizzle>, id: string) => {
  await db.delete(project).where(eq(project.id, parseInt(id)))
  return { success: true }
}

const getTaskDefinitionByName = async (
  db: ReturnType<typeof drizzle>,
  name: string,
  projectId: string,
): Promise<DBTaskDefinition | null> => {
  const result = await db
    .select({
      id: taskDefinition.id,
      name: taskDefinition.name,
      projectId: taskDefinition.projectId,
      projectName: project.name,
      statusId: taskDefinition.statusId,
      issueKey: taskDefinition.issueKey,
    })
    .from(taskDefinition)
    .innerJoin(project, eq(taskDefinition.projectId, project.id))
    .where(
      and(
        eq(taskDefinition.name, name),
        eq(taskDefinition.projectId, parseInt(projectId)),
      ),
    )
    .limit(1)
  if (result.length === 0) {
    return null
  }
  const td = result[0]
  return {
    id: td.id.toString(),
    name: td.name,
    projectId: td.projectId.toString(),
    projectName: td.projectName,
    statusId: td.statusId,
    issueKey: td.issueKey || undefined,
  }
}

const addTaskDefinition = async (
  db: ReturnType<typeof drizzle>,
  opts: DBAddTaskDefinitionOpts,
): Promise<
  { success: true; taskDefinition: DBTaskDefinition } | { success: false }
> => {
  const activeStatusId = await getOrCreateStatus(db, 'active')
  const existingTaskDef = await getTaskDefinitionByName(
    db,
    opts.name,
    opts.projectId,
  )
  if (existingTaskDef) {
    if (existingTaskDef.statusId !== activeStatusId) {
      await db
        .update(taskDefinition)
        .set({ statusId: activeStatusId })
        .where(and(eq(taskDefinition.id, parseInt(existingTaskDef.id))))
      existingTaskDef.statusId = activeStatusId
    }
    return { success: true, taskDefinition: existingTaskDef }
  }
  const result = await db
    .insert(taskDefinition)
    .values({
      name: opts.name,
      projectId: parseInt(opts.projectId),
      statusId: activeStatusId,
      issueKey: emptyToNull(opts.issueKey),
    })
    .returning({
      id: taskDefinition.id,
      name: taskDefinition.name,
      issueKey: taskDefinition.issueKey,
    })

  const project = await getProjectById(db, opts.projectId)
  if (!project) {
    return { success: false }
  }

  return {
    success: true,
    taskDefinition: {
      id: result[0].id.toString(),
      name: result[0].name,
      projectId: opts.projectId,
      projectName: project.name,
      issueKey: result[0].issueKey || undefined,
    },
  }
}

const mergeTaskDefinitionsByIds = async (
  db: ReturnType<typeof drizzle>,
  sourceTaskDefId: string,
  targetTaskDefId: string,
): Promise<{ success: true } | { success: false }> => {
  await db.transaction(async tx => {
    const sourceTasks = await tx
      .select()
      .from(task)
      .where(eq(task.taskDefinitionId, parseInt(sourceTaskDefId)))

    for (const srcTask of sourceTasks) {
      const sourceTaskDef = alias(taskDefinition, 'sourceTaskDef')

      const targetWithSameNameAsSource = await tx
        .select()
        .from(task)
        .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
        .innerJoin(sourceTaskDef, eq(taskDefinition.name, sourceTaskDef.name))
        .where(
          and(
            eq(taskDefinition.id, parseInt(targetTaskDefId)),
            eq(sourceTaskDef.id, parseInt(sourceTaskDefId)),
          ),
        )
        .limit(1)

      if (targetWithSameNameAsSource.length > 0) {
        // Task exists in target, sum seconds and delete source task
        const targetTask = targetWithSameNameAsSource[0]
        await tx
          .update(task)
          .set({ seconds: targetTask.Task.seconds + srcTask.seconds })
          .where(eq(task.id, targetTask.Task.id))
        await tx.delete(task).where(eq(task.id, srcTask.id))
      } else {
        // Task does not exist in target, update taskDefinitionId
        // to target task definition
        await tx
          .update(task)
          .set({ taskDefinitionId: parseInt(targetTaskDefId) })
          .where(eq(task.id, srcTask.id))
      }
    }

    // Now we can delete the source task definition
    await tx
      .delete(taskDefinition)
      .where(eq(taskDefinition.id, parseInt(sourceTaskDefId)))
  })
  return { success: true }
}

const mergeTaskDefinitions = async (
  db: ReturnType<typeof drizzle>,
  sourceTaskDefId: string,
  targetTaskDefId: string,
): Promise<{ success: true }> => {
  await mergeTaskDefinitionsByIds(db, sourceTaskDefId, targetTaskDefId)
  return { success: true }
}

const editTaskDefinition = async (
  db: ReturnType<typeof drizzle>,
  opts: DBEditTaskDefinitionOpts,
) => {
  const updateData: {
    name: string
    statusId?: number
    issueKey?: string | null
  } = {
    name: opts.name,
  }
  if (opts.status !== undefined) {
    const statusId = await getOrCreateStatus(db, opts.status)
    updateData.statusId = statusId
  }
  if (opts.issueKey !== undefined) {
    updateData.issueKey = emptyToNull(opts.issueKey)
  }

  await db
    .update(taskDefinition)
    .set(updateData)
    .where(eq(taskDefinition.id, parseInt(opts.id)))

  const definitionIssueKey = emptyToNull(opts.issueKey)
  if (definitionIssueKey) {
    await db
      .update(task)
      .set({ issueKey: definitionIssueKey })
      .where(
        and(
          eq(task.taskDefinitionId, parseInt(opts.id)),
          sql`(${task.issueKey} IS NULL OR TRIM(${task.issueKey}) = '')`,
        ),
      )
  }

  return { success: true }
}

const deleteTaskDefinition = async (
  db: ReturnType<typeof drizzle>,
  opts: DBDeleteTaskDefinitionOpts,
) => {
  await db
    .delete(taskDefinition)
    .where(eq(taskDefinition.id, parseInt(opts.id)))

  return { success: true }
}

const getTaskDefinitions = async (
  db: ReturnType<typeof drizzle>,
  projectId: string,
): Promise<DBTaskDefinition[]> => {
  const tasks = await db
    .select({
      id: taskDefinition.id,
      name: taskDefinition.name,
      projectId: taskDefinition.projectId,
      projectName: project.name,
      status: status.name,
      issueKey: taskDefinition.issueKey,
    })
    .from(taskDefinition)
    .innerJoin(project, eq(taskDefinition.projectId, project.id))
    .innerJoin(status, eq(taskDefinition.statusId, status.id))
    .where(eq(taskDefinition.projectId, parseInt(projectId)))

  return tasks.map(t => ({
    id: t.id.toString(),
    name: t.name,
    projectId: t.projectId.toString(),
    projectName: t.projectName,
    status: t.status,
    issueKey: t.issueKey || undefined,
  }))
}

const getAllTaskDefinitions = async (
  db: ReturnType<typeof drizzle>,
): Promise<DBTaskDefinition[]> => {
  const res = await db
    .select({
      id: taskDefinition.id,
      name: taskDefinition.name,
      projectId: taskDefinition.projectId,
      projectName: project.name,
      status: status.name,
      issueKey: taskDefinition.issueKey,
    })
    .from(taskDefinition)
    .innerJoin(project, eq(taskDefinition.projectId, project.id))
    .innerJoin(status, eq(taskDefinition.statusId, status.id))

  return res.map(t => ({
    id: t.id.toString(),
    name: t.name,
    projectId: t.projectId.toString(),
    projectName: t.projectName,
    status: t.status,
    issueKey: t.issueKey || undefined,
  }))
}

const addTask = async (db: ReturnType<typeof drizzle>, opts: DBAddTaskOpts) => {
  const activeStatusId = await getOrCreateStatus(db, 'active')
  // Use the current local SQLite DATETIME (to second precision) as start/end
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const yyyy = now.getFullYear()
  const mm = pad(now.getMonth() + 1)
  const dd = pad(now.getDate())
  const hh = pad(now.getHours())
  const mi = pad(now.getMinutes())
  const ss = pad(now.getSeconds())
  const nowLocal = `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`

  let issueKey = emptyToNull(opts.issueKey)
  if (!issueKey) {
    const definition = await db
      .select({ issueKey: taskDefinition.issueKey })
      .from(taskDefinition)
      .where(eq(taskDefinition.id, parseInt(opts.taskDefinitionId)))
      .limit(1)
    issueKey = emptyToNull(definition[0]?.issueKey)
  }

  const result = await db
    .insert(task)
    .values({
      taskDefinitionId: parseInt(opts.taskDefinitionId),
      description: opts.description,
      startDateTime: nowLocal,
      endDateTime: nowLocal,
      statusId: activeStatusId,
      issueKey,
    })
    .returning({ id: task.id })

  return { success: true, id: result[0].id.toString() }
}

const editTask = async (
  db: ReturnType<typeof drizzle>,
  opts: DBEditTaskOpts,
) => {
  const activeStatusId = await getOrCreateStatus(db, 'active')
  const updateData: {
    taskDefinitionId?: number
    description: string
    startDateTime: string
    endDateTime: string
    statusId: number
    issueKey?: string | null
  } = {
    description: opts.description,
    // Normalize to canonical SQLite DATETIME 'YYYY-MM-DD HH:MM:SS'
    startDateTime:
      opts.startDateTime.length === 16
        ? `${opts.startDateTime.replace('T', ' ')}:00`
        : opts.startDateTime.replace('T', ' '),
    endDateTime:
      opts.endDateTime.length === 16
        ? `${opts.endDateTime.replace('T', ' ')}:00`
        : opts.endDateTime.replace('T', ' '),
    statusId: activeStatusId,
  }

  if (opts.status !== undefined) {
    const statusId = await getOrCreateStatus(db, opts.status)
    updateData.statusId = statusId
  }
  updateData.issueKey = emptyToNull(opts.issueKey)

  const existingTaskResult = await db
    .select()
    .from(task)
    .where(eq(task.id, parseInt(opts.id)))
    .limit(1)

  if (existingTaskResult.length === 0) {
    throw new Error(`Task not found: ${opts.id}`)
  }

  const existingTask = existingTaskResult[0]
  if (existingTask.taskDefinitionId.toString() !== opts.taskDefinitionId) {
    updateData.taskDefinitionId = parseInt(opts.taskDefinitionId)
  }

  await db
    .update(task)
    .set(updateData)
    .where(eq(task.id, parseInt(opts.id)))

  return { success: true }
}

const deleteTask = async (
  db: ReturnType<typeof drizzle>,
  opts: DBDeleteTaskOpts,
) => {
  await db.delete(task).where(eq(task.id, parseInt(opts.id)))
  return { success: true }
}

const getTasks = async (
  db: ReturnType<typeof drizzle>,
  projectId: string,
): Promise<DBTask[]> => {
  const tasks = await db
    .select({
      id: task.id,
      taskDefinitionId: task.taskDefinitionId,
      description: task.description,
      startDateTime: task.startDateTime,
      endDateTime: task.endDateTime,
      status: status.name,
      taskDefinitionName: taskDefinition.name,
      projectName: project.name,
      companyName: company.name,
      issueKey: task.issueKey,
    })
    .from(task)
    .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
    .innerJoin(project, eq(taskDefinition.projectId, project.id))
    .innerJoin(status, eq(task.statusId, status.id))
    .innerJoin(company, eq(project.companyId, company.id))
    .where(eq(project.id, parseInt(projectId)))

  return tasks.map(t => {
    const start =
      typeof t.startDateTime === 'string'
        ? t.startDateTime
        : (t.startDateTime as Date).toISOString()
    const end =
      typeof t.endDateTime === 'string'
        ? t.endDateTime
        : (t.endDateTime as Date).toISOString()
    const dateStr = normalizeDateString(start)
    const seconds = Math.max(
      0,
      Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000),
    )

    return {
      id: t.id.toString(),
      name: t.taskDefinitionName,
      taskDefinitionId: t.taskDefinitionId.toString(),
      projectName: t.projectName,
      description: t.description || '',
      seconds,
      date: dateStr,
      status: t.status,
      companyName: t.companyName,
      startDateTime: start,
      endDateTime: end,
      issueKey: t.issueKey || undefined,
    }
  })
}

const getTasksByNameAndProject = async (
  db: ReturnType<typeof drizzle>,
  opts: { taskDefinitionId: string },
): Promise<DBTask[]> => {
  const tasks = await db
    .select({
      id: task.id,
      taskDefinitionId: task.taskDefinitionId,
      description: task.description,
      startDateTime: task.startDateTime,
      endDateTime: task.endDateTime,
      status: status.name,
      taskDefinitionName: taskDefinition.name,
      projectName: project.name,
      companyName: company.name,
      issueKey: task.issueKey,
    })
    .from(task)
    .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
    .innerJoin(project, eq(taskDefinition.projectId, project.id))
    .innerJoin(status, eq(task.statusId, status.id))
    .innerJoin(company, eq(project.companyId, company.id))
    .where(eq(task.taskDefinitionId, parseInt(opts.taskDefinitionId)))

  return tasks.map(t => {
    const start =
      typeof t.startDateTime === 'string'
        ? t.startDateTime
        : (t.startDateTime as Date).toISOString()
    const end =
      typeof t.endDateTime === 'string'
        ? t.endDateTime
        : (t.endDateTime as Date).toISOString()
    const dateStr = normalizeDateString(start)
    const seconds = Math.max(
      0,
      Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000),
    )

    return {
      id: t.id.toString(),
      name: t.taskDefinitionName,
      taskDefinitionId: t.taskDefinitionId.toString(),
      projectName: t.projectName,
      description: t.description || '',
      seconds,
      date: dateStr,
      status: t.status,
      companyName: t.companyName,
      startDateTime: start,
      endDateTime: end,
      issueKey: t.issueKey || undefined,
    }
  })
}

const getTasksToday = async (
  db: ReturnType<typeof drizzle>,
  projectId: string,
): Promise<DBTask[]> => {
  // Use today's date in ISO format for comparison (based on startDateTime)
  const today = new Date()
  const todayISO = new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  ).toISOString()
  const todayNormalized = normalizeDateString(todayISO)

  const tasks = await db
    .select({
      id: task.id,
      taskDefinitionId: task.taskDefinitionId,
      description: task.description,
      startDateTime: task.startDateTime,
      endDateTime: task.endDateTime,
      status: status.name,
      taskDefinitionName: taskDefinition.name,
      projectName: project.name,
      companyName: company.name,
      issueKey: task.issueKey,
    })
    .from(task)
    .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
    .innerJoin(project, eq(taskDefinition.projectId, project.id))
    .innerJoin(company, eq(project.companyId, company.id))
    .innerJoin(status, eq(task.statusId, status.id))
    .where(
      and(
        eq(project.id, parseInt(projectId)),
        sql`DATE(${task.startDateTime}) = DATE(${sql.raw(
          `'${todayNormalized}'`,
        )})`,
      ),
    )

  return tasks.map(t => {
    const start =
      typeof t.startDateTime === 'string'
        ? t.startDateTime
        : (t.startDateTime as Date).toISOString()
    const end =
      typeof t.endDateTime === 'string'
        ? t.endDateTime
        : (t.endDateTime as Date).toISOString()
    const dateStr = normalizeDateString(start)
    const seconds = Math.max(
      0,
      Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000),
    )

    return {
      id: t.id.toString(),
      name: t.taskDefinitionName,
      taskDefinitionId: t.taskDefinitionId.toString(),
      projectName: t.projectName,
      companyName: t.companyName,
      description: t.description || '',
      seconds,
      date: dateStr,
      status: t.status,
      startDateTime: start,
      endDateTime: end,
      issueKey: t.issueKey || undefined,
    }
  })
}

// Helper functions to query tasks by company and by project
const getTasksByCompany = async (
  db: ReturnType<typeof drizzle>,
  companyId: string,
): Promise<DBTask[]> => {
  const tasks = await db
    .select({
      id: task.id,
      taskDefinitionId: task.taskDefinitionId,
      description: task.description,
      startDateTime: task.startDateTime,
      endDateTime: task.endDateTime,
      durationSeconds: sql<number>`CAST((julianday(${task.endDateTime}) - julianday(${task.startDateTime})) * 86400 AS INTEGER)`,
      status: status.name,
      taskDefinitionName: taskDefinition.name,
      projectName: project.name,
      companyName: company.name,
      issueKey: sql<
        string | null
      >`NULLIF(TRIM(COALESCE(${task.issueKey}, ${taskDefinition.issueKey})), '')`,
    })
    .from(task)
    .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
    .innerJoin(project, eq(taskDefinition.projectId, project.id))
    .innerJoin(company, eq(project.companyId, company.id))
    .innerJoin(status, eq(task.statusId, status.id))
    .where(eq(company.id, parseInt(companyId)))

  return tasks.map(mapTaskRow)
}

const getTasksByProject = async (
  db: ReturnType<typeof drizzle>,
  projectId: string,
): Promise<DBTask[]> => {
  return getTasks(db, projectId)
}

const listTaskAttachments = async (
  db: ReturnType<typeof drizzle>,
  taskId: string,
): Promise<DBTaskAttachment[]> => {
  const rows = await db
    .select({
      id: taskAttachment.id,
      taskId: taskAttachment.taskId,
      filename: taskAttachment.filename,
      mimeType: taskAttachment.mimeType,
      size: taskAttachment.size,
    })
    .from(taskAttachment)
    .where(eq(taskAttachment.taskId, parseInt(taskId)))
    .orderBy(taskAttachment.filename)

  return rows.map(r => ({
    id: r.id.toString(),
    taskId: r.taskId.toString(),
    filename: r.filename,
    mimeType: r.mimeType,
    size: r.size,
  }))
}

const addTaskAttachment = async (
  db: ReturnType<typeof drizzle>,
  opts: DBAddTaskAttachmentOpts,
): Promise<
  | { success: true; attachment: DBTaskAttachment }
  | { success: false; error: string }
> => {
  const filename = opts.filename.trim()
  if (!filename) {
    return { success: false, error: 'Filename cannot be empty' }
  }

  const existing = await db
    .select({ id: taskAttachment.id })
    .from(taskAttachment)
    .where(
      and(
        eq(taskAttachment.taskId, parseInt(opts.taskId)),
        eq(taskAttachment.filename, filename),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    return {
      success: false,
      error: `An attachment named "${filename}" already exists on this entry`,
    }
  }

  const dataBuffer = Buffer.isBuffer(opts.data)
    ? opts.data
    : Buffer.from(opts.data)

  try {
    const result = await db
      .insert(taskAttachment)
      .values({
        taskId: parseInt(opts.taskId),
        filename,
        mimeType: opts.mimeType,
        size: dataBuffer.length,
        data: dataBuffer,
      })
      .returning({
        id: taskAttachment.id,
        taskId: taskAttachment.taskId,
        filename: taskAttachment.filename,
        mimeType: taskAttachment.mimeType,
        size: taskAttachment.size,
      })

    return {
      success: true,
      attachment: {
        id: result[0].id.toString(),
        taskId: result[0].taskId.toString(),
        filename: result[0].filename,
        mimeType: result[0].mimeType,
        size: result[0].size,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('UNIQUE') || message.includes('unique')) {
      return {
        success: false,
        error: `An attachment named "${filename}" already exists on this entry`,
      }
    }
    return { success: false, error: message }
  }
}

const renameTaskAttachment = async (
  db: ReturnType<typeof drizzle>,
  opts: DBRenameTaskAttachmentOpts,
): Promise<{ success: true } | { success: false; error: string }> => {
  const filename = opts.filename.trim()
  if (!filename) {
    return { success: false, error: 'Filename cannot be empty' }
  }

  const current = await db
    .select({
      id: taskAttachment.id,
      taskId: taskAttachment.taskId,
      filename: taskAttachment.filename,
    })
    .from(taskAttachment)
    .where(eq(taskAttachment.id, parseInt(opts.id)))
    .limit(1)

  if (current.length === 0) {
    return { success: false, error: 'Attachment not found' }
  }

  if (current[0].filename === filename) {
    return { success: true }
  }

  const collision = await db
    .select({ id: taskAttachment.id })
    .from(taskAttachment)
    .where(
      and(
        eq(taskAttachment.taskId, current[0].taskId),
        eq(taskAttachment.filename, filename),
      ),
    )
    .limit(1)

  if (collision.length > 0) {
    return {
      success: false,
      error: `An attachment named "${filename}" already exists on this entry`,
    }
  }

  try {
    await db
      .update(taskAttachment)
      .set({ filename })
      .where(eq(taskAttachment.id, parseInt(opts.id)))
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('UNIQUE') || message.includes('unique')) {
      return {
        success: false,
        error: `An attachment named "${filename}" already exists on this entry`,
      }
    }
    return { success: false, error: message }
  }
}

const deleteTaskAttachment = async (
  db: ReturnType<typeof drizzle>,
  id: string,
): Promise<{ success: boolean }> => {
  await db.delete(taskAttachment).where(eq(taskAttachment.id, parseInt(id)))
  return { success: true }
}

const getTaskAttachmentData = async (
  db: ReturnType<typeof drizzle>,
  id: string,
): Promise<DBTaskAttachmentData | null> => {
  const rows = await db
    .select({
      id: taskAttachment.id,
      taskId: taskAttachment.taskId,
      filename: taskAttachment.filename,
      mimeType: taskAttachment.mimeType,
      size: taskAttachment.size,
      data: taskAttachment.data,
    })
    .from(taskAttachment)
    .where(eq(taskAttachment.id, parseInt(id)))
    .limit(1)

  if (rows.length === 0) {
    return null
  }

  const row = rows[0]
  const dataBuffer = Buffer.isBuffer(row.data)
    ? row.data
    : Buffer.from(row.data as ArrayBuffer)

  return {
    id: row.id.toString(),
    taskId: row.taskId.toString(),
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    dataBase64: dataBuffer.toString('base64'),
  }
}

export type TaskExternalSyncRow = {
  id: number
  taskId: number
  connectionName: string
  remoteId: string
  remoteIssueId: string | null
  contentHash: string
  syncedAt: string
}

const getTaskExternalSync = async (
  db: ReturnType<typeof drizzle>,
  taskId: string,
): Promise<TaskExternalSyncRow | null> => {
  const rows = await db
    .select()
    .from(taskExternalSync)
    .where(eq(taskExternalSync.taskId, parseInt(taskId)))
    .limit(1)
  return rows[0] ?? null
}

const upsertTaskExternalSync = async (
  db: ReturnType<typeof drizzle>,
  opts: {
    taskId: string
    connectionName: string
    remoteId: string
    remoteIssueId?: string | null
    contentHash: string
  },
) => {
  const existing = await getTaskExternalSync(db, opts.taskId)
  const syncedAt = new Date().toISOString()
  if (existing) {
    await db
      .update(taskExternalSync)
      .set({
        connectionName: opts.connectionName,
        remoteId: opts.remoteId,
        remoteIssueId: opts.remoteIssueId ?? null,
        contentHash: opts.contentHash,
        syncedAt,
      })
      .where(eq(taskExternalSync.id, existing.id))
    return
  }
  await db.insert(taskExternalSync).values({
    taskId: parseInt(opts.taskId),
    connectionName: opts.connectionName,
    remoteId: opts.remoteId,
    remoteIssueId: opts.remoteIssueId ?? null,
    contentHash: opts.contentHash,
    syncedAt,
  })
}

export {
  addCompany,
  addProject,
  addTask,
  addTaskAttachment,
  addTaskDefinition,
  deleteCompany,
  deleteProject,
  deleteTask,
  deleteTaskAttachment,
  deleteTaskDefinition,
  editCompany,
  editProject,
  editTask,
  editTaskDefinition,
  getAllTaskDefinitions,
  getCompanies,
  getCompanyById,
  getCompanyByName,
  getDataForPDFExport,
  getProjectByName,
  getProjects,
  getSearchResult,
  getTaskAttachmentData,
  getTaskById,
  getTaskByTaskDefinitionAndDate,
  getTaskDefinitionByName,
  getTaskDefinitions,
  getTaskExternalSync,
  getTasks,
  getTasksByCompany,
  getTasksByNameAndProject,
  getTasksByProject,
  getTasksToday,
  initDB,
  listTaskAttachments,
  mergeCompanies,
  mergeProjects,
  mergeTaskDefinitions,
  renameTaskAttachment,
  saveActiveTask,
  saveActiveTasks,
  upsertTaskExternalSync,
}
