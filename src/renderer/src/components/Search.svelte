<script lang="ts">
  import { Hourglass, CalendarDays } from '@lucide/svelte'
  import moment from 'moment'
  import { marked } from 'marked'
  import {
    activeTasks,
    searchResults,
    selectedPanel,
    pdfExportData,
    pdfExportShowing,
    companies,
  } from '../stores'
  import EditCompanyModal from './modals/EditCompanyModal.svelte'
  import DeleteCompanyModal from './modals/DeleteCompanyModal.svelte'
  import EditProjectModal from './modals/EditProjectModal.svelte'
  import DeleteProjectModal from './modals/DeleteProjectModal.svelte'
  import EditTaskModal from './modals/EditTaskModal.svelte'
  import DeleteTaskModal from './modals/DeleteTaskModal.svelte'
  import EditTaskDefinitionModal from './modals/EditTaskDefinitionModal.svelte'
  import DeleteTaskDefinitionModal from './modals/DeleteTaskDefinitionModal.svelte'
  import InfoBox from './InfoBox.svelte'
  import {
    getHMSStringFromSeconds,
    prepareMarkdownWithBlankLineBreaks,
  } from '../lib/utils'
  import { tick, onMount } from 'svelte'

  marked.use({
    async: true,
    pedantic: false,
    gfm: true,
  })

  let searchResult: SearchQueryResult | null = $state(null)
  let loading = $state(false)
  let showEditCompanyModal = $state(false)
  let showDeleteCompanyModal = $state(false)
  let showEditProjectModal = $state(false)
  let showDeleteProjectModal = $state(false)
  let showEditTaskModal = $state(false)
  let showDeleteTaskModal = $state(false)
  let showEditTaskDefModal = $state(false)
  let showDeleteTaskDefModal = $state(false)

  let companyToEdit: DBCompany | null = $state(null)
  let companyToDelete: DBCompany | null = $state(null)
  let projectToEdit: DBProject | null = $state(null)
  let projectToDelete: DBProject | null = $state(null)
  let taskToEdit: DBTask | null = $state(null)
  let taskToDelete: DBTask | null = $state(null)
  let taskDefToEdit: DBTaskDefinition | null = $state(null)
  let taskDefToDelete: DBTaskDefinition | null = $state(null)

  // Form values
  let searchIn: string[] = $state(['tasks'])
  let fromDate = $state(moment().format('YYYY-MM-DD'))
  let toDate = $state(moment().format('YYYY-MM-DD'))
  let activeState = $state('all')
  let companyName = $state('*')
  let projectName = $state('*')
  let taskName = $state('*')
  let taskDescription = $state('*')
  let taskDefinitionName = $state('*')
  let attachmentFilename = $state('*')

  let activeTasksList = $state($activeTasks)
  let formValid = $derived(false)
  let exportFormat = $state<'csv' | 'pdf'>('csv')
  let exporting = $state(false)
  let eventListenersAdded = $state(false)
  let companiesList: DBCompany[] = $state([])

  // Load companies list
  onMount(async () => {
    // Load companies list
    if (window.electron) {
      try {
        const data = await window.electron.getCompanies()
        companies.set(data)
        companiesList = data
      } catch (error) {
        console.error('Error loading companies:', error)
      }
    }
    companies.subscribe(value => {
      companiesList = value
    })

    // Set up event listeners for PDF export
    if (!eventListenersAdded && window.electron) {
      window.electron.on(
        'on-pdf-export-file-selected',
        (data: { canceled: boolean }) => {
          if (data.canceled) {
            // User canceled - go back to search
            pdfExportData.set(null)
            pdfExportShowing.set(false)
            if ($selectedPanel === 'PDFDocument') {
              selectedPanel.set('Search')
            }
          }
        },
      )

      window.electron.on('on-pdf-export-file-saved', () => {
        // PDF saved successfully - go back to search
        pdfExportData.set(null)
        pdfExportShowing.set(false)
        if ($selectedPanel === 'PDFDocument') {
          selectedPanel.set('Search')
        }
      })

      eventListenersAdded = true
    }
  })

  $effect(() => {
    formValid =
      searchIn.length > 0 &&
      !!fromDate &&
      !!toDate &&
      !!activeState &&
      !!companyName &&
      !!projectName &&
      !!taskName &&
      !!taskDescription &&
      !!taskDefinitionName &&
      !!attachmentFilename
  })

  async function handleSearch(e: Event) {
    e.preventDefault()
    if (!formValid) return

    loading = true
    searchResult = null

    try {
      const query: SearchQuery = {
        search_in: $state.snapshot(searchIn),
        from_date: fromDate,
        to_date: toDate,
        active_state: activeState,
        task: {
          company_name: companyName,
          project_name: projectName,
          task_name: taskName,
          task_definition_name: taskDefinitionName,
          task_description: taskDescription,
          attachment_filename: attachmentFilename,
        },
      }

      if (window.electron) {
        const result = await window.electron.getSearchResult(query)
        searchResult = result
        searchResult.tasks.forEach(async task => {
          if (task.description) {
            task.descriptionHTML = await marked.parse(
              prepareMarkdownWithBlankLineBreaks(task.description),
            )
          } else {
            task.descriptionHTML = ''
          }
        })
        searchResults.set(result)
      }
    } catch (error) {
      console.error('Error searching:', error)
    } finally {
      loading = false
    }
  }

  function hasActiveTask(projectName: string): boolean {
    // Note: This checks by project name for display purposes
    // ActiveTask now uses taskId, so we need to check by projectName from the task
    return activeTasksList.some(at => at.projectName === projectName)
  }

  function hasActiveTaskForTaskDef(taskDef: DBTaskDefinition): boolean {
    // Note: This is a simplified check - we'd need to fetch tasks to match properly
    // For now, check by name/projectName which are display fields
    return activeTasksList.some(
      at => at.name === taskDef.name && at.projectName === taskDef.projectName,
    )
  }

  function hasActiveTaskForTask(task: DBTask): boolean {
    return activeTasksList.some(
      at => at.taskId === task.id && at.date === task.date,
    )
  }

  function handleEditProject(project: DBProject) {
    projectToEdit = project
    showEditProjectModal = true
  }

  function handleDeleteProject(project: DBProject) {
    projectToDelete = project
    showDeleteProjectModal = true
  }

  function handleEditTask(task: DBTask) {
    taskToEdit = task
    showEditTaskModal = true
  }

  async function handleEditTaskFromAttachment(
    attachment: SearchQueryResultAttachment,
  ) {
    if (!window.electron) return
    const task = await window.electron.getTaskById(attachment.taskId)
    if (!task) {
      alert('Parent task not found')
      return
    }
    taskToEdit = task
    showEditTaskModal = true
  }

  function handleDeleteTask(task: DBTask) {
    taskToDelete = task
    showDeleteTaskModal = true
  }

  function handleEditTaskDef(taskDef: DBTaskDefinition) {
    taskDefToEdit = taskDef
    showEditTaskDefModal = true
  }

  function handleDeleteTaskDef(taskDef: DBTaskDefinition) {
    taskDefToDelete = taskDef
    showDeleteTaskDefModal = true
  }

  function handleEditCompany(company: DBCompany) {
    companyToEdit = company
    showEditCompanyModal = true
  }

  function handleDeleteCompany(company: DBCompany) {
    companyToDelete = company
    showDeleteCompanyModal = true
  }

  async function handleExport() {
    if (!searchResult) return

    exporting = true
    try {
      if (exportFormat === 'csv') {
        await exportToCSV(searchResult)
      } else if (exportFormat === 'pdf') {
        await exportToPDF(searchResult)
      }
    } catch (error) {
      console.error('Error exporting:', error)
      alert('Failed to export. Please try again.')
    } finally {
      exporting = false
    }
  }

  async function exportToCSV(result: SearchQueryResult) {
    if (!window.electron) return

    if (result.tasks.length === 0) {
      alert('No tasks found to export. CSV export only supports tasks.')
      return
    }

    // Use search results directly instead of re-querying
    const data = result.tasks.map(task => ({
      companyName: task.companyName,
      projectName: task.projectName,
      name: task.name,
      date: task.date,
      description: task.description,
      seconds: task.seconds,
      issueKey: task.issueKey,
    }))

    const csvRows: string[] = []

    csvRows.push(
      'Company Name;Project Name;Task Name;Issue Key;Date;Description;Time',
    )

    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      const secs = seconds % 60
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }

    const escapeCSV = (value: string | null | undefined) => {
      if (value === null || value === undefined) return ''
      const str = String(value)
      if (str.includes(';') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    for (const task of data) {
      csvRows.push(
        `${escapeCSV(task.companyName)};${escapeCSV(task.projectName)};${escapeCSV(task.name)};${escapeCSV(task.issueKey)};${escapeCSV(task.date)};${escapeCSV(task.description)};${formatTime(task.seconds)}`,
      )
    }

    csvRows.push('')
    csvRows.push('Total Time by Company, Project and Task')
    csvRows.push('Company Name;Project Name;Task Name;Total Time')

    const totals: {
      [companyName: string]: {
        [projectName: string]: { [taskName: string]: number }
      }
    } = {}
    for (const task of data) {
      if (!totals[task.companyName]) {
        totals[task.companyName] = {}
      }
      if (!totals[task.companyName][task.projectName]) {
        totals[task.companyName][task.projectName] = {}
      }
      if (!totals[task.companyName][task.projectName][task.name]) {
        totals[task.companyName][task.projectName][task.name] = 0
      }
      totals[task.companyName][task.projectName][task.name] += task.seconds
    }

    for (const companyName of Object.keys(totals).sort()) {
      for (const projectName of Object.keys(totals[companyName]).sort()) {
        for (const taskName of Object.keys(
          totals[companyName][projectName],
        ).sort()) {
          const totalSeconds = totals[companyName][projectName][taskName]
          csvRows.push(
            `${escapeCSV(companyName)};${escapeCSV(projectName)};${escapeCSV(taskName)};${formatTime(totalSeconds)}`,
          )
        }
      }
    }

    const csvContent = csvRows.join('\n')

    const datestr = moment().format('YYYY-MM-DD')
    const dialogResult = await window.electron.showFileSaveDialog({
      defaultPath: `timetrack-export-${datestr}.csv`,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })

    if (!dialogResult.canceled && dialogResult.filePath) {
      await window.electron.saveFile(dialogResult.filePath, csvContent)
    }
  }

  async function exportToPDF(result: SearchQueryResult) {
    if (!window.electron) return

    // For PDF export, use search results directly
    // Only export tasks for PDF (as PDF export currently only supports tasks)
    if (result.tasks.length === 0) {
      alert('No tasks found to export. PDF export only supports tasks.')
      return
    }

    // Convert search results to PDFQueryResult format
    const data: PDFQueryResult[] = result.tasks.map(task => ({
      id: parseInt(task.id, 10),
      companyName: task.companyName,
      projectName: task.projectName,
      name: task.name,
      date: task.date,
      description: task.descriptionHTML,
      seconds: task.seconds,
    }))

    // Set up PDF document view using shared store
    pdfExportData.set(data)
    pdfExportShowing.set(true)
    selectedPanel.set('PDFDocument')

    // Wait for Svelte to render the PDFDocument component
    await tick()
    await tick()
    // Add a delay to ensure the component is fully rendered and visible
    await new Promise(resolve => setTimeout(resolve, 300))

    // Show file save dialog - PDFDocument will stay visible during this
    await window.electron.showFileSaveDialog({
      defaultPath: `timetrack-export-${moment().format('YYYY-MM-DD')}.pdf`,
      filters: [
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
  }

  function handleProjectModalClose(
    success: boolean,
    editedProject?: DBProject,
  ) {
    showEditProjectModal = false
    showDeleteProjectModal = false
    if (success && searchResult) {
      if (editedProject && projectToEdit) {
        searchResult.projects = searchResult.projects.map(p =>
          p.id === projectToEdit.id ? editedProject : p,
        )
      } else if (projectToDelete) {
        searchResult.projects = searchResult.projects.filter(
          p => p.id !== projectToDelete.id,
        )
      }
      searchResults.set(searchResult)
    }
    projectToEdit = null
    projectToDelete = null
  }

  function handleTaskModalClose(success: boolean, editedTask?: DBTask) {
    showEditTaskModal = false
    showDeleteTaskModal = false
    if (success && searchResult) {
      if (editedTask && taskToEdit) {
        searchResult.tasks = searchResult.tasks.map(t =>
          t.id === taskToEdit.id ? editedTask : t,
        )
      } else if (taskToDelete) {
        searchResult.tasks = searchResult.tasks.filter(
          t => t.id !== taskToDelete.id,
        )
      }
      searchResults.set(searchResult)
    }
    taskToEdit = null
    taskToDelete = null
  }

  function handleTaskDefModalClose(
    success: boolean,
    editedTaskDef?: DBTaskDefinition,
  ) {
    showEditTaskDefModal = false
    showDeleteTaskDefModal = false
    if (success && searchResult) {
      if (editedTaskDef && taskDefToEdit) {
        searchResult.task_definitions = searchResult.task_definitions.map(td =>
          td.id === taskDefToEdit.id ? editedTaskDef : td,
        )
      } else if (taskDefToDelete) {
        searchResult.task_definitions = searchResult.task_definitions.filter(
          td => td.id !== taskDefToDelete.id,
        )
      }
      searchResults.set(searchResult)
    }
    taskDefToEdit = null
    taskDefToDelete = null
  }

  function handleCompanyModalClose(
    success: boolean,
    editedCompany?: DBCompany,
  ) {
    showEditCompanyModal = false
    showDeleteCompanyModal = false
    if (success && searchResult) {
      if (editedCompany && companyToEdit) {
        searchResult.companies = searchResult.companies.map(c =>
          c.id === companyToEdit.id ? editedCompany : c,
        )
      } else if (companyToDelete) {
        searchResult.companies = searchResult.companies.filter(
          c => c.id !== companyToDelete.id,
        )
      }
      searchResults.set(searchResult)
    }
    companyToEdit = null
    companyToDelete = null
  }
</script>

{#if showEditCompanyModal && companyToEdit}
  <EditCompanyModal
    company={companyToEdit}
    onClose={(s, c) => handleCompanyModalClose(s, c)}
  />
{/if}

{#if showDeleteCompanyModal && companyToDelete}
  <DeleteCompanyModal
    company={companyToDelete}
    onClose={s => handleCompanyModalClose(s)}
  />
{/if}

{#if showEditProjectModal && projectToEdit}
  <EditProjectModal
    project={projectToEdit}
    onClose={(s, p) => handleProjectModalClose(s, p)}
  />
{/if}

{#if showDeleteProjectModal && projectToDelete}
  <DeleteProjectModal
    project={projectToDelete}
    onClose={s => handleProjectModalClose(s)}
  />
{/if}

{#if showEditTaskModal && taskToEdit}
  <EditTaskModal
    task={taskToEdit}
    onSuccess={(s, t) => handleTaskModalClose(s, t)}
    onClose={(s, t) => handleTaskModalClose(s, t)}
  />
{/if}

{#if showDeleteTaskModal && taskToDelete}
  <DeleteTaskModal
    task={taskToDelete}
    onSuccess={() => handleTaskModalClose(true)}
    onClose={() => handleTaskModalClose(false)}
  />
{/if}

{#if showEditTaskDefModal && taskDefToEdit}
  <EditTaskDefinitionModal
    taskDefinition={taskDefToEdit}
    onClose={(s, td) => handleTaskDefModalClose(s, td)}
  />
{/if}

{#if showDeleteTaskDefModal && taskDefToDelete}
  <DeleteTaskDefinitionModal
    taskDefinition={taskDefToDelete}
    onClose={s => handleTaskDefModalClose(s)}
  />
{/if}

<section class="section">
  <h1 class="text-2xl font-bold">Search</h1>
  <h2 class="text-lg text-base-content/70">
    You can search across tasks and projects.
  </h2>

  <form onsubmit={handleSearch} class="mt-4">
    <div class="grid grid-cols-3 gap-4">
      <!-- Query Form -->
      <div class="card bg-base-200 shadow-xl">
        <div class="card-body">
          <h2 class="card-title">Query</h2>

          <div class="form-control">
            <label class="label" for="searchIn">
              <span class="label-text">Search in</span>
            </label>
            <select
              id="searchIn"
              multiple
              class="select select-bordered select-multiple"
              bind:value={searchIn}
              required
            >
              <option value="projects">Projects</option>
              <option value="task_definitions">Task Definitions</option>
              <option value="tasks">Tasks</option>
              <option value="attachments">Attachments</option>
            </select>
            <label class="label" for="searchIn">
              <span class="label-text-alt"
                >Hold Ctrl/Cmd to select multiple</span
              >
            </label>
          </div>

          <div class="form-control mt-2">
            <label class="label" for="fromDate">
              <span class="label-text">From</span>
            </label>
            <input
              id="fromDate"
              type="date"
              bind:value={fromDate}
              class="input input-bordered"
              required
            />
          </div>

          <div class="form-control mt-2">
            <label class="label" for="toDate">
              <span class="label-text">To</span>
            </label>
            <input
              id="toDate"
              type="date"
              bind:value={toDate}
              class="input input-bordered"
              required
            />
          </div>

          <div class="form-control mt-2">
            <label class="label" for="activeState">
              <span class="label-text">Active State</span>
            </label>
            <select
              id="activeState"
              bind:value={activeState}
              class="select select-bordered"
              required
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div class="form-control mt-2">
            <label class="label" for="companyName">
              <span class="label-text">Company Name</span>
            </label>
            <select
              id="companyName"
              bind:value={companyName}
              class="select select-bordered"
              required
            >
              <option value="*">All Companies</option>
              {#each companiesList as company (company.id)}
                <option
                  value={company.name}
                  selected={companyName === company.name}
                >
                  {company.name}
                </option>
              {/each}
            </select>
          </div>

          <div class="form-control mt-2">
            <label class="label" for="projectName">
              <span class="label-text">Project Name</span>
            </label>
            <input
              id="projectName"
              type="text"
              bind:value={projectName}
              placeholder="Project Name (* for all)"
              class="input input-bordered"
              required
            />
          </div>

          <div class="form-control mt-2">
            <label class="label" for="taskName">
              <span class="label-text">Task Name</span>
            </label>
            <input
              id="taskName"
              type="text"
              bind:value={taskName}
              placeholder="Task Name (* for all)"
              class="input input-bordered"
              required
            />
          </div>

          <div class="form-control mt-2">
            <label class="label" for="taskDescription">
              <span class="label-text">Task Description</span>
            </label>
            <input
              id="taskDescription"
              type="text"
              bind:value={taskDescription}
              placeholder="Task Description (* for all)"
              class="input input-bordered"
              required
            />
          </div>

          <div class="form-control mt-2">
            <label class="label" for="taskDefinitionName">
              <span class="label-text">Task Definition Name</span>
            </label>
            <input
              id="taskDefinitionName"
              type="text"
              bind:value={taskDefinitionName}
              placeholder="Task Definition Name (* for all)"
              class="input input-bordered"
              required
            />
          </div>

          <div class="form-control mt-2">
            <label class="label" for="attachmentFilename">
              <span class="label-text">Attachment Filename</span>
            </label>
            <input
              id="attachmentFilename"
              type="text"
              bind:value={attachmentFilename}
              placeholder="Attachment Filename (* for all)"
              class="input input-bordered"
              required
            />
          </div>

          <div class="form-control mt-4">
            <button
              type="submit"
              class="btn btn-primary w-full"
              disabled={!formValid || loading}
            >
              {#if loading}
                <span class="loading loading-spinner"></span>
                Searching...
              {:else}
                Search
              {/if}
            </button>
          </div>

          {#if searchResult}
            <div class="form-control mt-4">
              <label class="label" for="exportFormat">
                <span class="label-text">Export Format</span>
              </label>
              <select
                id="exportFormat"
                bind:value={exportFormat}
                class="select select-bordered"
              >
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
              </select>
            </div>

            <div class="form-control mt-4">
              <button
                type="button"
                class="btn btn-success w-full"
                disabled={exporting || !searchResult}
                onclick={handleExport}
              >
                {#if exporting}
                  <span class="loading loading-spinner"></span>
                  Exporting...
                {:else}
                  Export {exportFormat.toUpperCase()}
                {/if}
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Results -->
      {#if loading}
        <div class="card bg-base-200 shadow-xl col-span-2">
          <div class="card-body">
            <h2 class="card-title">Loading</h2>
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        </div>
      {:else if searchResult}
        <div class="col-span-2 space-y-4">
          <!-- Companies Results -->
          {#if searchIn.includes('companies') && searchResult.companies.length > 0}
            <div class="card bg-base-200 shadow-xl">
              <div class="card-body">
                <h2 class="card-title">Companies</h2>
                <div class="space-y-2">
                  {#each searchResult.companies as company (company.id)}
                    <div class="card bg-base-100">
                      <div class="card-body">
                        <div class="flex items-center justify-between">
                          <div>
                            <h3 class="card-title text-lg">{company.name}</h3>
                            {#if company.status}
                              <span
                                class="badge {company.status === 'active'
                                  ? 'badge-success'
                                  : 'badge-error'}"
                              >
                                {company.status}
                              </span>
                            {/if}
                          </div>
                          <div class="card-actions">
                            <button
                              class="btn btn-warning btn-sm"
                              onclick={() => handleEditCompany(company)}
                            >
                              Edit
                            </button>
                            <button
                              class="btn btn-error btn-sm"
                              onclick={() => handleDeleteCompany(company)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          <!-- Projects Results -->
          {#if searchIn.includes('projects') && searchResult.projects.length > 0}
            <div class="card bg-base-200 shadow-xl">
              <div class="card-body">
                <h2 class="card-title">Projects</h2>
                <div class="space-y-2">
                  {#each searchResult.projects as project (project.id)}
                    <div class="card bg-base-100">
                      <div class="card-body">
                        <h3 class="card-title text-lg">{project.name}</h3>
                        <div class="card-actions justify-end">
                          {#if hasActiveTask(project.name)}
                            <InfoBox type="warning" title="Warning">
                              A task belonging to this project is currently
                              active, you need to stop it to perform any action.
                            </InfoBox>
                          {:else}
                            <button
                              class="btn btn-warning btn-sm"
                              onclick={() => handleEditProject(project)}
                            >
                              Edit
                            </button>
                            <button
                              class="btn btn-error btn-sm"
                              onclick={() => handleDeleteProject(project)}
                            >
                              Delete
                            </button>
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          <!-- Task Definitions Results -->
          {#if searchIn.includes('task_definitions') && searchResult.task_definitions.length > 0}
            <div class="card bg-base-200 shadow-xl">
              <div class="card-body">
                <h2 class="card-title">Task Definitions</h2>
                <div class="space-y-2">
                  {#each searchResult.task_definitions as taskDef (taskDef.id)}
                    <div class="card bg-base-100">
                      <div class="card-body">
                        <h3 class="card-title text-lg">{taskDef.name}</h3>
                        <p class="text-sm text-base-content/70">
                          {taskDef.projectName}
                        </p>
                        <div class="card-actions justify-end">
                          {#if hasActiveTaskForTaskDef(taskDef)}
                            <InfoBox type="warning" title="Warning">
                              A task belonging to this task definition is
                              currently active, you need to stop it to perform
                              any action.
                            </InfoBox>
                          {:else}
                            <button
                              class="btn btn-warning btn-sm"
                              onclick={() => handleEditTaskDef(taskDef)}
                            >
                              Edit
                            </button>
                            <button
                              class="btn btn-error btn-sm"
                              onclick={() => handleDeleteTaskDef(taskDef)}
                            >
                              Delete
                            </button>
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          <!-- Tasks Results -->
          {#if searchIn.includes('tasks') && searchResult.tasks.length > 0}
            <!-- Statistics -->
            <div role="alert" class="alert">
              <CalendarDays size="16" class="text-info" />
              <span>
                The tasks shown are between <strong>{fromDate}</strong> and
                <strong>{toDate}</strong>.
              </span>
            </div>
            <div role="alert" class="alert">
              <Hourglass size="16" class="text-secondary" />
              <span>
                All tasks combined have a total time of
                <strong>
                  {getHMSStringFromSeconds(
                    searchResult.tasks.reduce(
                      (sum, task) => sum + task.seconds,
                      0,
                    ),
                  )}
                </strong>
              </span>
            </div>

            <!-- Tasks List -->
            <div class="card bg-base-200 shadow-xl">
              <div class="card-body">
                <h2 class="card-title">Tasks</h2>
                <div class="space-y-2">
                  {#each searchResult.tasks as task (task.id)}
                    <div class="card bg-base-100">
                      <div class="card-body">
                        <h3 class="card-title text-lg">{task.name}</h3>
                        <p class="text-sm text-base-content/70">
                          {task.projectName}{task.issueKey
                            ? ` · ${task.issueKey}`
                            : ''}
                        </p>
                        {#if task.description}
                          <div class="markdown-content">
                            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                            {@html task.descriptionHTML}
                          </div>
                        {/if}
                        <div class="flex gap-4 text-sm">
                          <div class="flex items-center gap-1">
                            <i class="fa-solid fa-calendar"></i>
                            <span>{task.date}</span>
                          </div>
                          <div class="flex items-center gap-1">
                            <i class="fa-solid fa-clock"></i>
                            <span>{getHMSStringFromSeconds(task.seconds)}</span>
                          </div>
                        </div>
                        {#if task.attachmentFilenames && task.attachmentFilenames.length > 0}
                          <div class="mt-2">
                            <p class="text-sm font-medium">Attachments</p>
                            <ul class="list-disc list-inside text-sm">
                              {#each task.attachmentFilenames as filename (filename)}
                                <li class="break-all">{filename}</li>
                              {/each}
                            </ul>
                          </div>
                        {/if}
                        <div class="card-actions justify-end">
                          {#if hasActiveTaskForTask(task)}
                            <InfoBox type="warning" title="Warning">
                              This task is currently active, you need to stop it
                              to perform any action.
                            </InfoBox>
                          {:else}
                            <button
                              class="btn btn-warning btn-sm"
                              onclick={() => handleEditTask(task)}
                            >
                              Edit
                            </button>
                            <button
                              class="btn btn-error btn-sm"
                              onclick={() => handleDeleteTask(task)}
                            >
                              Delete
                            </button>
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          <!-- Attachments Results -->
          {#if searchIn.includes('attachments') && searchResult.attachments.length > 0}
            <div class="card bg-base-200 shadow-xl">
              <div class="card-body">
                <h2 class="card-title">Attachments</h2>
                <div class="space-y-2">
                  {#each searchResult.attachments as attachment (attachment.id)}
                    <div class="card bg-base-100">
                      <div class="card-body">
                        <h3 class="card-title text-lg break-all">
                          {attachment.filename}
                        </h3>
                        <p class="text-sm text-base-content/70">
                          {attachment.taskName} · {attachment.projectName} · {attachment.companyName}
                        </p>
                        <div class="flex gap-4 text-sm flex-wrap">
                          <span>{attachment.mimeType}</span>
                          <span>{attachment.date}</span>
                          <span
                            >{getHMSStringFromSeconds(attachment.seconds)}</span
                          >
                        </div>
                        <div class="card-actions justify-end">
                          <button
                            class="btn btn-warning btn-sm"
                            onclick={() =>
                              handleEditTaskFromAttachment(attachment)}
                          >
                            Edit Entry
                          </button>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}

          {#if searchResult.companies.length === 0 && searchResult.projects.length === 0 && searchResult.task_definitions.length === 0 && searchResult.tasks.length === 0 && searchResult.attachments.length === 0}
            <div class="alert alert-info">
              <span>No results found</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </form>
</section>

<style>
</style>
