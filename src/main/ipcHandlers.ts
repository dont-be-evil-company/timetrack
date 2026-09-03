import {
  BrowserWindow,
  dialog,
  ipcMain,
  IpcMainInvokeEvent,
  shell,
} from 'electron'
import moment from 'moment'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { CountUp } from '../countup'

// Helper to normalize date (handle both Date objects and ISO strings)
const normalizeDate = (date: Date | string): string => {
  if (typeof date === 'string') {
    // If it's already a string, extract date part if it's ISO format
    return date.includes('T') ? date.split('T')[0] : date
  }
  return date.toISOString().split('T')[0]
}
import {
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
  getCompanyByName,
  getDatabase,
  getDataForPDFExport,
  getProjectByName,
  getProjects,
  getSearchResult,
  getTaskAttachmentData,
  getTaskById,
  getTaskByTaskDefinitionAndDate,
  getTaskDefinitionByName,
  getTaskDefinitions,
  getTasks,
  getTasksByNameAndProject,
  getTasksToday,
  listTaskAttachments,
  mergeCompanies,
  mergeProjects,
  mergeTaskDefinitions,
  renameTaskAttachment,
  saveActiveTask,
  saveActiveTasks,
} from '../database'
import { getTempoConnectionNames } from '../lib/SyncConfig'
import { syncCompanyToTempo } from '../lib/tempo/sync'
import { mimeTypeFromFilename } from '../lib/mime'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { company, project, task, taskDefinition } from '../db/schema'
import { eq } from 'drizzle-orm'

const openExternalPath = async (filePath: string): Promise<void> => {
  const open = (await import('open')).default
  await open(filePath)
}

let DB: ReturnType<typeof drizzle>
let WINDOW: BrowserWindow
const activeTasks: InstanceType<typeof CountUp>[] = []
let handlersInitialized = false

export const areHandlersReady = (): boolean => handlersInitialized

export const initIpcHandlers = async (
  mainWindow: BrowserWindow,
): Promise<void> => {
  WINDOW = mainWindow
  DB = await getDatabase()

  const getActiveTasks = async (): Promise<ActiveTask[]> => {
    return Promise.all(
      activeTasks.map(async t => {
        // Fetch task details from database to include name and projectName
        const taskResult = await DB.select({
          taskDefinitionName: taskDefinition.name,
          projectName: project.name,
          companyName: company.name,
        })
          .from(task)
          .innerJoin(
            taskDefinition,
            eq(task.taskDefinitionId, taskDefinition.id),
          )
          .innerJoin(project, eq(taskDefinition.projectId, project.id))
          .innerJoin(company, eq(project.companyId, company.id))
          .where(eq(task.id, parseInt(t.taskId, 10)))
          .limit(1)

        const taskData = taskResult[0]
        return {
          taskId: t.taskId,
          description: t.description,
          date: t.date,
          seconds: t.seconds,
          isActive: t.isActive,
          name: taskData?.taskDefinitionName || '',
          projectName: taskData?.projectName || '',
          companyName: taskData?.companyName || '',
        }
      }),
    )
  }

  const addActiveTask = (task: ActiveTask) => {
    const countup = new CountUp({
      taskId: task.taskId,
      description: task.description,
      date: task.date,
      seconds: task.seconds,
    })
    activeTasks.push(countup)
    return countup
  }

  const getActiveTask = (id: string): InstanceType<typeof CountUp> | null => {
    return activeTasks.find(t => t.taskId === id) || null
  }

  const startActiveTask = async (
    id: string,
  ): Promise<ActiveTask & { success: boolean }> => {
    const activeTask = getActiveTask(id)
    if (!activeTask) {
      // Fetch task details for response
      const dbTaskResult = await DB.select({
        taskDefinitionName: taskDefinition.name,
        projectName: project.name,
        companyName: company.name,
        description: task.description,
        startDateTime: task.startDateTime,
        endDateTime: task.endDateTime,
      })
        .from(task)
        .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
        .innerJoin(project, eq(taskDefinition.projectId, project.id))
        .innerJoin(company, eq(project.companyId, company.id))
        .where(eq(task.id, parseInt(id, 10)))
        .limit(1)

      const dbTask = dbTaskResult[0]
      if (!dbTask) {
        throw new Error(`Task not found: ${id}`)
      }

      const start =
        typeof dbTask.startDateTime === 'string'
          ? dbTask.startDateTime
          : (dbTask.startDateTime as Date).toISOString()
      const end =
        typeof dbTask.endDateTime === 'string'
          ? dbTask.endDateTime
          : (dbTask.endDateTime as Date).toISOString()
      const taskDate = normalizeDate(start)
      const seconds = Math.max(
        0,
        Math.floor(
          (new Date(end).getTime() - new Date(start).getTime()) / 1000,
        ),
      )
      const addedTask = addActiveTask({
        name: dbTask.taskDefinitionName,
        companyName: dbTask.companyName,
        projectName: dbTask.projectName,
        taskId: id,
        description: dbTask.description || '',
        date: taskDate,
        seconds,
        isActive: true,
      })
      addedTask.start()
      return {
        success: true,
        taskId: id,
        description: dbTask.taskDefinitionName,
        date: taskDate,
        seconds,
        isActive: true,
        name: dbTask.taskDefinitionName,
        projectName: dbTask.projectName,
        companyName: dbTask.companyName,
      }
    }
    if (activeTask.isActive) {
      console.warn('task already active', id)
      const dbTaskResult = await DB.select({
        taskDefinitionName: taskDefinition.name,
        projectName: project.name,
        companyName: company.name,
        startDateTime: task.startDateTime,
      })
        .from(task)
        .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
        .innerJoin(project, eq(taskDefinition.projectId, project.id))
        .innerJoin(company, eq(project.companyId, company.id))
        .where(eq(task.id, parseInt(id, 10)))
        .limit(1)

      const dbTask = dbTaskResult[0]
      if (!dbTask) {
        throw new Error(`Task not found: ${id}`)
      }

      const start =
        typeof dbTask.startDateTime === 'string'
          ? dbTask.startDateTime
          : (dbTask.startDateTime as Date).toISOString()
      const taskDate = normalizeDate(start)
      return {
        success: false,
        taskId: id,
        description: activeTask.description,
        date: taskDate,
        seconds: activeTask.seconds,
        isActive: true,
        name: dbTask.taskDefinitionName,
        projectName: dbTask.projectName,
        companyName: dbTask.companyName,
      }
    } else {
      activeTask.start()
      const dbTaskResult = await DB.select({
        taskDefinitionName: taskDefinition.name,
        projectName: project.name,
        companyName: company.name,
        startDateTime: task.startDateTime,
      })
        .from(task)
        .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
        .innerJoin(project, eq(taskDefinition.projectId, project.id))
        .innerJoin(company, eq(project.companyId, company.id))
        .where(eq(task.id, parseInt(id, 10)))
        .limit(1)

      const dbTask = dbTaskResult[0]
      if (!dbTask) {
        throw new Error(`Task not found: ${id}`)
      }

      const start =
        typeof dbTask.startDateTime === 'string'
          ? dbTask.startDateTime
          : (dbTask.startDateTime as Date).toISOString()
      const taskDate = normalizeDate(start)
      return {
        success: true,
        taskId: id,
        description: activeTask.description,
        date: taskDate,
        seconds: activeTask.seconds,
        isActive: true,
        name: dbTask.taskDefinitionName,
        projectName: dbTask.projectName,
        companyName: dbTask.companyName,
      }
    }
  }

  const stopActiveTask = async (
    id: string,
  ): Promise<(ActiveTask & { success: true }) | { success: false }> => {
    const activeTask = getActiveTask(id)
    if (!activeTask) {
      console.error('task not found', id)
      return { success: false }
    }
    activeTask.stop()
    // Save using taskId directly
    await saveActiveTask(DB, {
      taskId: activeTask.taskId,
      date: activeTask.date,
      seconds: activeTask.seconds,
    })
    const idx = activeTasks.findIndex(t => t.taskId === id)
    const f = activeTasks.find(t => t.taskId === id)
    if (f) {
      const clone = Object.assign({}, f)
      activeTasks.splice(idx, 1)
      // Fetch task details for response
      const dbTaskResult = await DB.select({
        taskDefinitionName: taskDefinition.name,
        projectName: project.name,
        companyName: company.name,
        startDateTime: task.startDateTime,
      })
        .from(task)
        .innerJoin(taskDefinition, eq(task.taskDefinitionId, taskDefinition.id))
        .innerJoin(project, eq(taskDefinition.projectId, project.id))
        .innerJoin(company, eq(project.companyId, company.id))
        .where(eq(task.id, parseInt(activeTask.taskId, 10)))
        .limit(1)

      const dbTask = dbTaskResult[0]
      if (!dbTask) {
        throw new Error(`Task not found: ${activeTask.taskId}`)
      }

      const start =
        typeof dbTask.startDateTime === 'string'
          ? dbTask.startDateTime
          : (dbTask.startDateTime as Date).toISOString()
      const taskDate = normalizeDate(start)
      return {
        success: true,
        taskId: id,
        description: clone.description,
        date: taskDate,
        seconds: clone.seconds,
        isActive: false,
        name: dbTask.taskDefinitionName,
        projectName: dbTask.projectName,
        companyName: dbTask.companyName,
      }
    } else {
      return { success: false }
    }
  }

  const getPDFExport = async (evt: IpcMainInvokeEvent, filepath: string) => {
    const win = BrowserWindow.fromWebContents(evt.sender)
    if (!win) {
      console.error('No window found for PDF export')
      return
    }
    const options = {}
    const pdfWriterResult = await win.webContents.printToPDF(options)
    // Buffer is compatible with writeFileSync, but TypeScript types are strict
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fs.writeFileSync(filepath, pdfWriterResult as any)
    evt.sender.send('on-pdf-export-file-saved', filepath)
    shell.openExternal('file://' + filepath)
  }

  // IPC Handlers
  ipcMain.handle(
    'showFileSaveDialog',
    async (
      _,
      options?: {
        defaultPath?: string
        filters?: Electron.FileFilter[]
      },
    ) => {
      const datestr = moment().format('YYYY-MM-DD')
      const dialogOptions: Electron.SaveDialogOptions = {
        properties: ['showOverwriteConfirmation'],
        defaultPath: options?.defaultPath || `timetrack-report-${datestr}.pdf`,
      }
      if (options?.filters) {
        dialogOptions.filters = options.filters
      }
      const dialogResult = await dialog.showSaveDialog(WINDOW, dialogOptions)
      if (!dialogResult.canceled && dialogResult.filePath) {
        // Only auto-export PDF if it's a PDF file
        if (dialogResult.filePath.endsWith('.pdf')) {
          WINDOW.webContents.send('on-pdf-export-file-selected', dialogResult)
          await getPDFExport(
            { sender: WINDOW.webContents } as IpcMainInvokeEvent,
            dialogResult.filePath,
          )
        } else {
          WINDOW.webContents.send('on-pdf-export-file-selected', dialogResult)
        }
      } else {
        WINDOW.webContents.send('on-pdf-export-file-selected', dialogResult)
      }
      return dialogResult
    },
  )

  ipcMain.handle('saveFile', async (_, filePath: string, content: string) => {
    fs.writeFileSync(filePath, content, 'utf-8')
    shell.openExternal('file://' + filePath)
    return { success: true }
  })

  ipcMain.handle(
    'saveBinaryFile',
    async (_, filePath: string, dataBase64: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fs.writeFileSync(filePath, Buffer.from(dataBase64, 'base64') as any)
      shell.openExternal('file://' + filePath)
      return { success: true }
    },
  )

  ipcMain.handle(
    'showOpenFileDialog',
    async (
      _,
      options?: {
        filters?: Electron.FileFilter[]
      },
    ) => {
      const dialogOptions: Electron.OpenDialogOptions = {
        properties: ['openFile', 'multiSelections'],
      }
      if (options?.filters) {
        dialogOptions.filters = options.filters
      }
      return await dialog.showOpenDialog(WINDOW, dialogOptions)
    },
  )

  ipcMain.handle('listTaskAttachments', async (_, taskId: string) =>
    listTaskAttachments(DB, taskId),
  )

  ipcMain.handle(
    'addTaskAttachmentsFromPaths',
    async (_, taskId: string, filePaths: string[]) => {
      const attachments: DBTaskAttachment[] = []
      const errors: string[] = []

      for (const filePath of filePaths) {
        try {
          const filename = path.basename(filePath)
          const data = fs.readFileSync(filePath)
          const mimeType = mimeTypeFromFilename(filename)
          const result = await addTaskAttachment(DB, {
            taskId,
            filename,
            mimeType,
            data,
          })
          if (result.success) {
            attachments.push(result.attachment)
          } else {
            errors.push(`${filename}: ${result.error}`)
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          errors.push(`${path.basename(filePath)}: ${message}`)
        }
      }

      return {
        success: errors.length === 0,
        attachments,
        errors,
      }
    },
  )

  ipcMain.handle(
    'renameTaskAttachment',
    async (_, opts: DBRenameTaskAttachmentOpts) =>
      renameTaskAttachment(DB, opts),
  )

  ipcMain.handle('deleteTaskAttachment', async (_, id: string) =>
    deleteTaskAttachment(DB, id),
  )

  ipcMain.handle('getTaskAttachmentData', async (_, id: string) =>
    getTaskAttachmentData(DB, id),
  )

  ipcMain.handle('openTaskAttachment', async (_, id: string) => {
    const attachment = await getTaskAttachmentData(DB, id)
    if (!attachment) {
      return { success: false, error: 'Attachment not found' }
    }

    try {
      const tempDir = path.join(os.tmpdir(), 'timetrack-attachments')
      fs.mkdirSync(tempDir, { recursive: true })
      // Keep id in the path so same-named files from different entries don't collide
      const safeName = path.basename(attachment.filename)
      const tempPath = path.join(tempDir, `${attachment.id}-${safeName}`)

      fs.writeFileSync(
        tempPath,
        Buffer.from(attachment.dataBase64, 'base64') as unknown as string,
      )
      await openExternalPath(tempPath)
      return { success: true, filePath: tempPath }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle(
    'saveAttachmentToFile',
    async (_, id: string, defaultPath?: string) => {
      const attachment = await getTaskAttachmentData(DB, id)
      if (!attachment) {
        return { success: false }
      }

      const dialogResult = await dialog.showSaveDialog(WINDOW, {
        properties: ['showOverwriteConfirmation'],
        defaultPath: defaultPath || attachment.filename,
      })

      if (dialogResult.canceled || !dialogResult.filePath) {
        return { success: false, canceled: true }
      }

      fs.writeFileSync(
        dialogResult.filePath,
        Buffer.from(attachment.dataBase64, 'base64') as unknown as string,
      )
      await openExternalPath(dialogResult.filePath)
      return { success: true, filePath: dialogResult.filePath }
    },
  )

  // Company handlers
  ipcMain.handle('getCompanyByName', async (_, name: string) =>
    getCompanyByName(DB, name),
  )
  ipcMain.handle('getCompanies', async (_, statusName?: string) =>
    getCompanies(DB, statusName),
  )
  ipcMain.handle('addCompany', async (_, name: string) => addCompany(DB, name))
  ipcMain.handle(
    'mergeCompanies',
    async (_, sourceId: string, targetId: string) =>
      mergeCompanies(DB, sourceId, targetId),
  )
  ipcMain.handle('editCompany', async (_, opts: DBEditCompanyOpts) =>
    editCompany(DB, opts),
  )
  ipcMain.handle('deleteCompany', async (_, id: string) =>
    deleteCompany(DB, id),
  )

  // Project handlers
  ipcMain.handle(
    'getProjectByName',
    async (_, name: string, companyId: string) =>
      getProjectByName(DB, name, companyId),
  )
  ipcMain.handle(
    'getProjects',
    async (_, companyId?: string, statusName?: string) =>
      getProjects(DB, companyId, statusName),
  )
  ipcMain.handle('addProject', async (_, name: string, companyId: string) =>
    addProject(DB, name, companyId),
  )
  ipcMain.handle(
    'mergeProjects',
    async (_, sourceId: string, targetId: string) =>
      mergeProjects(DB, sourceId, targetId),
  )
  ipcMain.handle('editProject', async (_, opts: DBEditProjectOpts) =>
    editProject(DB, opts),
  )
  ipcMain.handle('deleteProject', async (_, id: string) =>
    deleteProject(DB, id),
  )
  ipcMain.handle(
    'addTaskDefinition',
    async (_, opts: DBAddTaskDefinitionOpts) => addTaskDefinition(DB, opts),
  )
  ipcMain.handle(
    'mergeTaskDefinitions',
    async (_, sourceId: string, targetId: string) =>
      mergeTaskDefinitions(DB, sourceId, targetId),
  )
  ipcMain.handle(
    'editTaskDefinition',
    async (_, opts: DBEditTaskDefinitionOpts) => editTaskDefinition(DB, opts),
  )
  ipcMain.handle(
    'deleteTaskDefinition',
    async (_, opts: DBDeleteTaskDefinitionOpts) =>
      deleteTaskDefinition(DB, opts),
  )
  ipcMain.handle('getTaskDefinitions', async (_, projectId: string) =>
    getTaskDefinitions(DB, projectId),
  )
  ipcMain.handle(
    'getTaskDefinitionByName',
    async (_, name: string, projectId: string) =>
      getTaskDefinitionByName(DB, name, projectId),
  )
  ipcMain.handle('getAllTaskDefinitions', async () => getAllTaskDefinitions(DB))
  ipcMain.handle('addTask', async (_, opts: DBAddTaskOpts) => addTask(DB, opts))
  ipcMain.handle('editTask', async (_, opts: DBEditTaskOpts) => {
    await editTask(DB, opts)
    return { ...opts, success: true }
  })
  ipcMain.handle('deleteTask', async (_, opts: DBDeleteTaskOpts) =>
    deleteTask(DB, opts),
  )
  ipcMain.handle('getTasks', async (_, projectId: string) =>
    getTasks(DB, projectId),
  )
  ipcMain.handle(
    'getTasksByNameAndProject',
    async (_, opts: { taskDefinitionId: string }) =>
      getTasksByNameAndProject(DB, opts),
  )
  ipcMain.handle('getTaskById', async (_, id: string) => getTaskById(DB, id))
  ipcMain.handle(
    'getTaskByTaskDefinitionAndDate',
    async (_, id: string, date: string) =>
      getTaskByTaskDefinitionAndDate(DB, id, date),
  )
  ipcMain.handle('getTasksToday', async (_, projectId: string) =>
    getTasksToday(DB, projectId),
  )
  ipcMain.handle('getActiveTasks', async () => getActiveTasks())
  ipcMain.handle('startActiveTask', async (_, id: string) =>
    startActiveTask(id),
  )
  ipcMain.handle('stopActiveTask', async (_, id: string) => stopActiveTask(id))
  ipcMain.handle('getDataForPDFExport', async (_, opts: PDFQuery) =>
    getDataForPDFExport(DB, opts),
  )
  ipcMain.handle('getSearchResult', async (_, opts: SearchQuery) =>
    getSearchResult(DB, opts),
  )
  ipcMain.handle('getTempoConnections', async () => getTempoConnectionNames())
  ipcMain.handle(
    'syncCompanyToTempo',
    async (_, companyId: string): Promise<TempoSyncResult> => {
      const activeTaskIds = new Set(activeTasks.map(t => t.taskId))
      return syncCompanyToTempo(DB, companyId, activeTaskIds)
    },
  )

  handlersInitialized = true
  // Signal to renderer that IPC handlers are ready and database is initialized
  mainWindow.webContents.send('app-ready')
}

export const getActiveTasksForSave = (): Array<{
  taskId: string
  date: string
  seconds: number
}> => {
  return activeTasks.map(t => ({
    taskId: t.taskId,
    date: t.date,
    seconds: t.seconds,
  }))
}

export const periodicSaveActiveTasks = async () => {
  const activeTasksToSave = getActiveTasksForSave()
  // Now we can use taskId directly
  const validTasks = activeTasksToSave.map(task => ({
    taskId: task.taskId,
    date: task.date,
    seconds: task.seconds,
  }))

  await saveActiveTasks(DB, validTasks)
}
