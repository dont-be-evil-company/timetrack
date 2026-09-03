import { contextBridge, ipcRenderer } from 'electron'

const API = {
  // Companies
  getCompanyByName: async (name: string): Promise<DBCompany | null> => {
    return await ipcRenderer.invoke('getCompanyByName', name)
  },
  getCompanies: async (): Promise<DBCompany[]> => {
    return await ipcRenderer.invoke('getCompanies')
  },
  addCompany: async (name: string): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('addCompany', name)
  },
  mergeCompanies: async (
    sourceCompanyId: string,
    targetCompanyId: string,
  ): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke(
      'mergeCompanies',
      sourceCompanyId,
      targetCompanyId,
    )
  },
  editCompany: async (
    opts: DBEditCompanyOpts,
  ): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('editCompany', opts)
  },
  deleteCompany: async (id: string): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('deleteCompany', id)
  },

  // Projects
  getProjectByName: async (
    name: string,
    companyId: string,
  ): Promise<DBProject | null> => {
    return await ipcRenderer.invoke('getProjectByName', name, companyId)
  },
  getProjects: async (companyId?: string): Promise<DBProject[]> => {
    return await ipcRenderer.invoke('getProjects', companyId)
  },
  addProject: async (
    name: string,
    companyId: string,
  ): Promise<{ success: boolean; id: string }> => {
    return await ipcRenderer.invoke('addProject', name, companyId)
  },
  mergeProjects: async (
    sourceProjectId: string,
    targetProjectId: string,
  ): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke(
      'mergeProjects',
      sourceProjectId,
      targetProjectId,
    )
  },
  editProject: async (
    opts: DBEditProjectOpts,
  ): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('editProject', opts)
  },
  deleteProject: async (id: string): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('deleteProject', id)
  },

  // Task Definitions
  getTaskDefinitionByName: async (
    name: string,
    projectId: string,
  ): Promise<DBTaskDefinition | null> => {
    return await ipcRenderer.invoke('getTaskDefinitionByName', name, projectId)
  },
  addTaskDefinition: async (
    opts: DBAddTaskDefinitionOpts,
  ): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('addTaskDefinition', opts)
  },
  mergeTaskDefinitions: async (
    sourceTaskDefinitionId: string,
    targetTaskDefinitionId: string,
  ): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke(
      'mergeTaskDefinitions',
      sourceTaskDefinitionId,
      targetTaskDefinitionId,
    )
  },
  editTaskDefinition: async (
    opts: DBEditTaskDefinitionOpts,
  ): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('editTaskDefinition', opts)
  },
  deleteTaskDefinition: async (
    opts: DBDeleteTaskDefinitionOpts,
  ): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('deleteTaskDefinition', opts)
  },
  getTaskDefinitions: async (
    projectId: string,
  ): Promise<DBTaskDefinition[]> => {
    return await ipcRenderer.invoke('getTaskDefinitions', projectId)
  },
  getAllTaskDefinitions: async (): Promise<DBTaskDefinition[]> => {
    return await ipcRenderer.invoke('getAllTaskDefinitions')
  },

  // Tasks
  addTask: async (opts: DBAddTaskOpts): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('addTask', opts)
  },
  editTask: async (
    opts: DBEditTaskOpts,
  ): Promise<DBTask & { success: boolean }> => {
    return await ipcRenderer.invoke('editTask', opts)
  },
  deleteTask: async (opts: DBDeleteTaskOpts): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('deleteTask', opts)
  },
  getTaskById: async (id: string): Promise<DBTask | null> => {
    return await ipcRenderer.invoke('getTaskById', id)
  },
  getTaskByTaskDefinitionAndDate: async (
    id: string,
    date: string,
  ): Promise<DBTask | null> => {
    return await ipcRenderer.invoke('getTaskByTaskDefinitionAndDate', id, date)
  },
  getTasks: async (projectId: string): Promise<DBTask[]> => {
    return await ipcRenderer.invoke('getTasks', projectId)
  },
  getTasksByNameAndProject: async (opts: {
    taskDefinitionId: string
  }): Promise<DBTask[]> => {
    return await ipcRenderer.invoke('getTasksByNameAndProject', opts)
  },
  getTasksToday: async (projectId: string): Promise<DBTask[]> => {
    return await ipcRenderer.invoke('getTasksToday', projectId)
  },

  // Active Tasks
  getActiveTasks: async (): Promise<ActiveTask[]> => {
    return await ipcRenderer.invoke('getActiveTasks')
  },
  startActiveTask: async (
    id: string,
  ): Promise<ActiveTask & { success: boolean }> => {
    return await ipcRenderer.invoke('startActiveTask', id)
  },
  stopActiveTask: async (
    id: string,
  ): Promise<(ActiveTask & { success: true }) | { success: false }> => {
    return await ipcRenderer.invoke('stopActiveTask', id)
  },

  // PDF Export
  getDataForPDFExport: async (opts: PDFQuery): Promise<PDFQueryResult[]> => {
    return await ipcRenderer.invoke('getDataForPDFExport', opts)
  },
  showFileSaveDialog: async (options?: {
    defaultPath?: string
    filters?: Electron.FileFilter[]
  }): Promise<Electron.SaveDialogReturnValue> => {
    return await ipcRenderer.invoke('showFileSaveDialog', options)
  },
  showOpenFileDialog: async (options?: {
    filters?: Electron.FileFilter[]
  }): Promise<Electron.OpenDialogReturnValue> => {
    return await ipcRenderer.invoke('showOpenFileDialog', options)
  },
  saveFile: async (
    filePath: string,
    content: string,
  ): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('saveFile', filePath, content)
  },
  saveBinaryFile: async (
    filePath: string,
    dataBase64: string,
  ): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('saveBinaryFile', filePath, dataBase64)
  },

  // Search
  getSearchResult: async (query: SearchQuery): Promise<SearchQueryResult> => {
    return await ipcRenderer.invoke('getSearchResult', query)
  },

  // Attachments
  listTaskAttachments: async (taskId: string): Promise<DBTaskAttachment[]> => {
    return await ipcRenderer.invoke('listTaskAttachments', taskId)
  },
  addTaskAttachmentsFromPaths: async (
    taskId: string,
    filePaths: string[],
  ): Promise<{
    success: boolean
    attachments: DBTaskAttachment[]
    errors: string[]
  }> => {
    return await ipcRenderer.invoke(
      'addTaskAttachmentsFromPaths',
      taskId,
      filePaths,
    )
  },
  renameTaskAttachment: async (
    opts: DBRenameTaskAttachmentOpts,
  ): Promise<{ success: boolean; error?: string }> => {
    return await ipcRenderer.invoke('renameTaskAttachment', opts)
  },
  deleteTaskAttachment: async (id: string): Promise<{ success: boolean }> => {
    return await ipcRenderer.invoke('deleteTaskAttachment', id)
  },
  getTaskAttachmentData: async (
    id: string,
  ): Promise<DBTaskAttachmentData | null> => {
    return await ipcRenderer.invoke('getTaskAttachmentData', id)
  },
  openTaskAttachment: async (
    id: string,
  ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    return await ipcRenderer.invoke('openTaskAttachment', id)
  },
  saveAttachmentToFile: async (
    id: string,
    defaultPath?: string,
  ): Promise<{ success: boolean; canceled?: boolean; filePath?: string }> => {
    return await ipcRenderer.invoke('saveAttachmentToFile', id, defaultPath)
  },

  getTempoConnections: async (): Promise<string[]> => {
    return await ipcRenderer.invoke('getTempoConnections')
  },
  syncCompanyToTempo: async (companyId: string): Promise<TempoSyncResult> => {
    return await ipcRenderer.invoke('syncCompanyToTempo', companyId)
  },

  // Events
  on: (channel: string, callback: (data: unknown) => void) => {
    ipcRenderer.on(channel, (_, data) => callback(data))
  },
  off: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
}

try {
  contextBridge.exposeInMainWorld('electron', API)
} catch (error) {
  console.error(error)
}
