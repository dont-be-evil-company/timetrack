import { derived, writable } from 'svelte/store'

export const selectedPanel = writable<string>('Overview')
export const selectedCompany = writable<DBCompany | null>(null)
export const selectedProject = writable<DBProject | null>(null)
export const selectedTask = writable<DBTask | null>(null)
export const selectedTaskDefinition = writable<DBTaskDefinition | null>(null)

// Data stores
export const companies = writable<DBCompany[]>([])
export const projects = writable<DBProject[]>([])
export const tasks = writable<DBTask[]>([])
export const taskDefinitions = writable<DBTaskDefinition[]>([])
export const activeTasks = writable<ActiveTask[]>([])
export const searchResults = writable<SearchQueryResult | null>(null)
export const pdfExportData = writable<PDFQueryResult[] | null>(null)
export const pdfExportShowing = writable<boolean>(false)

// Derived stores
export const projectsForSelectedCompany = derived(
  [projects, selectedCompany],
  ([$projects, $selectedCompany]) => {
    if (!$selectedCompany || !$selectedCompany.id) return []
    return $projects.filter(p => p.companyId === $selectedCompany.id)
  },
)

export const tasksForSelectedProject = derived(
  [tasks, taskDefinitions, selectedProject],
  ([$tasks, $taskDefinitions, $selectedProject]) => {
    if (!$selectedProject || !$selectedProject.id) return []
    // Filter tasks by matching their taskDefinitionId to taskDefinitions with the selected projectId
    const projectTaskDefinitionIds = new Set(
      $taskDefinitions
        .filter(td => td.projectId === $selectedProject.id)
        .map(td => td.id),
    )
    return $tasks.filter(t => projectTaskDefinitionIds.has(t.taskDefinitionId))
  },
)

export const taskDefinitionsForSelectedProject = derived(
  [taskDefinitions, selectedProject],
  ([$taskDefinitions, $selectedProject]) => {
    if (!$selectedProject || !$selectedProject.id) return []
    return $taskDefinitions.filter(td => td.projectId === $selectedProject.id)
  },
)

export type IssuePickerRequest = {
  companyId: string
  onSelect: (issueKey: string) => void
}

export const issuePicker = writable<IssuePickerRequest | null>(null)
