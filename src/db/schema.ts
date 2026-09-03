import {
  sqliteTable,
  text,
  integer,
  blob,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

export const status = sqliteTable('Status', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

export const company = sqliteTable('Company', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  statusId: integer('statusId')
    .notNull()
    .references(() => status.id, { onDelete: 'restrict' }),
  tempoConnection: text('tempoConnection'),
})

export const project = sqliteTable(
  'Project',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    companyId: integer('companyId')
      .notNull()
      .references(() => company.id, { onDelete: 'cascade' }),
    statusId: integer('statusId')
      .notNull()
      .references(() => status.id, { onDelete: 'restrict' }),
  },
  table => ({
    nameCompanyUnique: uniqueIndex('Project_name_companyId_key').on(
      table.name,
      table.companyId,
    ),
  }),
)

export const taskDefinition = sqliteTable(
  'TaskDefinition',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    projectId: integer('projectId')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    statusId: integer('statusId')
      .notNull()
      .references(() => status.id, { onDelete: 'restrict' }),
    issueKey: text('issueKey'),
  },
  table => ({
    nameProjectUnique: uniqueIndex('TaskDefinition_name_projectId_key').on(
      table.name,
      table.projectId,
    ),
  }),
)

export const task = sqliteTable('Task', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskDefinitionId: integer('taskDefinitionId')
    .notNull()
    .references(() => taskDefinition.id, { onDelete: 'cascade' }),
  description: text('description'),
  startDateTime: text('startDateTime').notNull(),
  endDateTime: text('endDateTime').notNull(),
  statusId: integer('statusId')
    .notNull()
    .references(() => status.id, { onDelete: 'restrict' }),
  issueKey: text('issueKey'),
})

export const taskExternalSync = sqliteTable(
  'TaskExternalSync',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('taskId')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    connectionName: text('connectionName').notNull(),
    remoteId: text('remoteId').notNull(),
    remoteIssueId: text('remoteIssueId'),
    contentHash: text('contentHash').notNull(),
    syncedAt: text('syncedAt').notNull(),
  },
  table => ({
    taskIdUnique: uniqueIndex('TaskExternalSync_taskId_key').on(table.taskId),
  }),
)

export const taskAttachment = sqliteTable(
  'TaskAttachment',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('taskId')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mimeType: text('mimeType').notNull(),
    size: integer('size').notNull(),
    data: blob('data', { mode: 'buffer' }).notNull(),
  },
  table => ({
    taskFilenameUnique: uniqueIndex('TaskAttachment_taskId_filename_key').on(
      table.taskId,
      table.filename,
    ),
  }),
)

// Relations
export const statusRelations = relations(status, ({ many }) => ({
  companies: many(company),
  projects: many(project),
  taskDefinitions: many(taskDefinition),
  tasks: many(task),
}))

export const companyRelations = relations(company, ({ one, many }) => ({
  status: one(status, {
    fields: [company.statusId],
    references: [status.id],
  }),
  projects: many(project),
}))

export const projectRelations = relations(project, ({ one, many }) => ({
  company: one(company, {
    fields: [project.companyId],
    references: [company.id],
  }),
  status: one(status, {
    fields: [project.statusId],
    references: [status.id],
  }),
  taskDefinitions: many(taskDefinition),
}))

export const taskDefinitionRelations = relations(
  taskDefinition,
  ({ one, many }) => ({
    project: one(project, {
      fields: [taskDefinition.projectId],
      references: [project.id],
    }),
    status: one(status, {
      fields: [taskDefinition.statusId],
      references: [status.id],
    }),
    tasks: many(task),
  }),
)

export const taskRelations = relations(task, ({ one, many }) => ({
  taskDefinition: one(taskDefinition, {
    fields: [task.taskDefinitionId],
    references: [taskDefinition.id],
  }),
  status: one(status, {
    fields: [task.statusId],
    references: [status.id],
  }),
  attachments: many(taskAttachment),
  externalSync: one(taskExternalSync, {
    fields: [task.id],
    references: [taskExternalSync.taskId],
  }),
}))

export const taskExternalSyncRelations = relations(
  taskExternalSync,
  ({ one }) => ({
    task: one(task, {
      fields: [taskExternalSync.taskId],
      references: [task.id],
    }),
  }),
)

export const taskAttachmentRelations = relations(taskAttachment, ({ one }) => ({
  task: one(task, {
    fields: [taskAttachment.taskId],
    references: [task.id],
  }),
}))

// Type exports
export type Status = InferSelectModel<typeof status>
export type Company = InferSelectModel<typeof company>
export type Project = InferSelectModel<typeof project>
export type TaskDefinition = InferSelectModel<typeof taskDefinition>
export type Task = InferSelectModel<typeof task>
export type TaskAttachment = InferSelectModel<typeof taskAttachment>
export type TaskExternalSync = InferSelectModel<typeof taskExternalSync>
