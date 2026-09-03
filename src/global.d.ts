type ActiveTask = {
  taskId: string
  description: string
  date: string
  seconds: number
  tick?: NodeJS.Timeout | null
  isActive?: boolean
  name: string
  projectName: string
  companyName: string
}

type PDFTotalObject = {
  [key: string]: {
    [key: string]: number
  }
}

type PDFQueryResult = {
  id: number
  date: string
  description: string
  name: string
  projectName: string
  companyName: string
  seconds: number
}

type PDFQueryTask = {
  project_name: string
  name: string
}

type PDFQuery = {
  from: string
  to: string
  tasks: PDFQueryTask[]
}

type SearchQueryTask = {
  project_name: string
  task_name: string
  task_definition_name: string
  task_description: string
  company_name: string
  attachment_filename: string
}

type SearchQuery = {
  search_in: string[]
  active_state: string
  from_date: string
  task: SearchQueryTask
  to_date: string
}

type SearchQueryResultTask = DBTask & {
  descriptionHTML?: string
  attachmentFilenames?: string[]
}

type SearchQueryResultAttachment = {
  id: string
  filename: string
  mimeType: string
  size: number
  taskId: string
  taskName: string
  taskDefinitionId: string
  projectName: string
  companyName: string
  date: string
  description: string
  seconds: number
  status?: string
  startDateTime?: string
}

type SearchQueryResult = {
  companies: DBCompany[]
  projects: DBProject[]
  task_definitions: DBTaskDefinition[]
  tasks: SearchQueryResultTask[]
  attachments: SearchQueryResultAttachment[]
}

type DBCompany = {
  id: string
  name: string
  status?: string
  statusId?: number
  tempoConnection?: string | null
}

type DBProject = {
  id: string
  name: string
  companyId: string
  companyName: string
  company: DBCompany
  status?: string
  statusId?: number
}

type DBTaskDefinition = {
  id: string
  name: string
  projectId: string
  projectName: string
  status?: string
  statusId?: number
  issueKey?: string | null
}

type DBTask = {
  id: string
  name: string
  taskDefinitionId: string
  projectName: string
  companyName: string
  description: string
  seconds: number
  date: string
  startDateTime?: string
  endDateTime?: string
  status?: string
  issueKey?: string | null
}

type MainProcessActiveTaskMapped = {
  taskId: string
  date: string
  seconds: number
  time: string
  isActive: boolean
}

type MainProcessManageActiveTasksOpts = {
  taskId: string
  date: string
  seconds?: number
}

type MainProccessAddActiveTaskOpts = {
  taskId: string
  date: string
  seconds: number
}

type DBEditCompanyOpts = {
  id: string
  name: string
  status?: string
  tempoConnection?: string | null
}

type DBEditProjectOpts = {
  id: string
  name: string
  companyId: string
  status?: string
}

type DBAddTaskDefinitionOpts = {
  name: string
  projectId: string
  issueKey?: string | null
}

type DBEditTaskDefinitionOpts = {
  id: string
  name: string
  status?: string
  issueKey?: string | null
}

type DBDeleteTaskDefinitionOpts = {
  id: string
}

type DBAddTaskOpts = {
  taskDefinitionId: string
  description: string
  seconds: number
  issueKey?: string | null
}

type DBEditTaskOpts = {
  id: string
  taskDefinitionId: string
  description: string
  startDateTime: string
  endDateTime: string
  status?: string
  issueKey?: string | null
}

type DBDeleteTaskOpts = {
  id: string
}

type TempoSyncItemStatus =
  | 'created'
  | 'updated'
  | 'skipped'
  | 'unchanged'
  | 'failed'

type TempoSyncItemResult = {
  taskId: string
  taskName: string
  issueKey?: string
  status: TempoSyncItemStatus
  message?: string
}

type TempoSyncResult = {
  success: boolean
  error?: string
  created: number
  updated: number
  skipped: number
  unchanged: number
  failed: number
  items: TempoSyncItemResult[]
}

type DBTaskAttachment = {
  id: string
  taskId: string
  filename: string
  mimeType: string
  size: number
}

type DBAddTaskAttachmentOpts = {
  taskId: string
  filename: string
  mimeType: string
  data: Buffer | Uint8Array
}

type DBRenameTaskAttachmentOpts = {
  id: string
  filename: string
}

type DBTaskAttachmentData = DBTaskAttachment & {
  dataBase64: string
}

type MainProcessIPCHandle = {
  id: string
  cb: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string
declare const electron: any // eslint-disable-line @typescript-eslint/no-explicit-any

declare module '*?asset' {
  const content: string
  export default content
}

interface Window {
  versions: {
    node: string
    chrome: string
    electron: string
  }
  electron: {
    on: (channel: string, callback: ElectronOnCallback) => void
    off: (channel: string) => void
    getCompanyByName: (name: string) => Promise<DBCompany | null>
    getCompanies: (statusName?: string) => Promise<DBCompany[]>
    addCompany: (
      name: string,
    ) => Promise<{ success: boolean; company: DBCompany }>
    mergeCompanies: (
      sourceCompanyId: string,
      targetCompanyId: string,
    ) => Promise<{ success: boolean }>
    editCompany: (opts: DBEditCompanyOpts) => Promise<{ success: boolean }>
    deleteCompany: (id: string) => Promise<{ success: boolean }>
    addProject: (
      name: string,
      companyId: string,
    ) => Promise<{ success: boolean; project: DBProject }>
    mergeProjects: (
      sourceProjectId: string,
      targetProjectId: string,
    ) => Promise<{ success: boolean }>
    editProject: (opts: DBEditProjectOpts) => Promise<{ success: boolean }>
    deleteProject: (id: string) => Promise<{ success: boolean }>
    getProjectByName: (
      name: string,
      companyId: string,
    ) => Promise<DBProject | null>
    getProjects: (
      companyId?: string,
      statusName: string,
    ) => Promise<DBProject[]>
    addTaskDefinition: (opts: DBAddTaskDefinitionOpts) => Promise<{
      success: boolean
      taskDefinition: DBTaskDefinition
    }>
    mergeTaskDefinitions: (
      sourceTaskDefinitionId: string,
      targetTaskDefinitionId: string,
    ) => Promise<{ success: boolean }>
    editTaskDefinition: (opts: DBEditTaskDefinitionOpts) => Promise<{
      success: boolean
    }>
    deleteTaskDefinition: (opts: DBDeleteTaskDefinitionOpts) => Promise<{
      success: boolean
    }>
    getTasksToday: (projectId: string) => Promise<DBTask[]>
    getTaskDefinitionByName: (
      name: string,
      projectId: string,
    ) => Promise<DBTaskDefinition | null>
    getTaskDefinitions: (projectId: string) => Promise<DBTaskDefinition[]>
    getTaskById: (id: string) => Promise<DBTask | null>
    getTaskByTaskDefinitionAndDate: (
      id: string,
      date: string,
    ) => Promise<DBTask | null>
    addTask: (opts: DBAddTaskOpts) => Promise<{ success: boolean; id: string }>
    editTask: (opts: DBEditTaskOpts) => Promise<DBTask & { success: boolean }>
    deleteTask: (opts: DBDeleteTaskOpts) => Promise<{ success: boolean }>
    getTasks: (projectId: string) => Promise<DBTask[]>
    getTasksByNameAndProject: (opts: {
      taskDefinitionId: string
    }) => Promise<DBTask[]>
    getActiveTasks: () => Promise<ActiveTask[]>
    startActiveTask: (id: string) => Promise<ActiveTask & { success: boolean }>
    stopActiveTask: (
      id: string,
    ) => Promise<(ActiveTask & { success: true }) | { success: false }>
    getDataForPDFExport: (opts: PDFQuery) => Promise<PDFQueryResult[]>
    showFileSaveDialog: (options?: {
      defaultPath?: string
      filters?: Electron.FileFilter[]
    }) => Promise<Electron.SaveDialogReturnValue>
    showOpenFileDialog: (options?: {
      filters?: Electron.FileFilter[]
    }) => Promise<Electron.OpenDialogReturnValue>
    saveFile: (
      filePath: string,
      content: string,
    ) => Promise<{ success: boolean }>
    saveBinaryFile: (
      filePath: string,
      dataBase64: string,
    ) => Promise<{ success: boolean }>
    getPDFExport: (filepath: string) => Promise<void>
    getSearchResult: (query: SearchQuery) => Promise<SearchQueryResult>
    listTaskAttachments: (taskId: string) => Promise<DBTaskAttachment[]>
    addTaskAttachmentsFromPaths: (
      taskId: string,
      filePaths: string[],
    ) => Promise<{
      success: boolean
      attachments: DBTaskAttachment[]
      errors: string[]
    }>
    renameTaskAttachment: (
      opts: DBRenameTaskAttachmentOpts,
    ) => Promise<{ success: boolean; error?: string }>
    deleteTaskAttachment: (id: string) => Promise<{ success: boolean }>
    getTaskAttachmentData: (id: string) => Promise<DBTaskAttachmentData | null>
    openTaskAttachment: (
      id: string,
    ) => Promise<{ success: boolean; filePath?: string; error?: string }>
    saveAttachmentToFile: (
      id: string,
      defaultPath?: string,
    ) => Promise<{ success: boolean; canceled?: boolean; filePath?: string }>
    getTempoConnections: () => Promise<string[]>
    syncCompanyToTempo: (companyId: string) => Promise<TempoSyncResult>
  }
}
