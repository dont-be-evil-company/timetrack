<script lang="ts">
  import {
    projects,
    selectedProject,
    selectedCompany,
    selectedTask,
    selectedTaskDefinition,
    projectsForSelectedCompany,
  } from '../stores'
  import AddProjectModal from './modals/AddProjectModal.svelte'
  import EditProjectModal from './modals/EditProjectModal.svelte'
  import DeleteProjectModal from './modals/DeleteProjectModal.svelte'
  import { Plus, Folder, Trash, SquarePen } from '@lucide/svelte'

  let modalType = $state<'add' | 'edit' | 'delete' | null>(null)

  const companyProjects = $derived(projectsForSelectedCompany)

  selectedCompany.subscribe(async value => {
    if (value && value.id) {
      await fetchProjects(value.id)
    } else {
      projects.set([])
    }
  })

  async function fetchProjects(companyId?: string) {
    if (window.electron) {
      try {
        const data = await window.electron.getProjects(companyId, 'active')
        projects.set(data)
      } catch (error) {
        console.error('Error loading projects:', error)
      }
    }
  }

  function handleProjectSelect(e: Event) {
    const select = e.target as HTMLSelectElement
    const projectId = select.value
    if (projectId === '') {
      selectedProject.set(null)
      selectedTask.set(null)
      selectedTaskDefinition.set(null)
      return
    }
    const project = $companyProjects.find(p => p.id === projectId) || null
    selectedTask.set(null)
    selectedTaskDefinition.set(null)
    selectedProject.set(project)
  }
</script>

{#if modalType === 'add' && $selectedCompany}
  <AddProjectModal
    company={$selectedCompany}
    onSuccess={async () => {
      modalType = null
      const companyId = $selectedCompany?.id
      if (companyId) await fetchProjects(companyId)
    }}
    onClose={() => (modalType = null)}
  />
{/if}

{#if modalType === 'edit' && $selectedProject}
  <EditProjectModal
    onSuccess={async () => {
      modalType = null
      const companyId = $selectedCompany?.id
      if (companyId) await fetchProjects(companyId)
    }}
    project={$selectedProject}
    onClose={() => (modalType = null)}
  />
{/if}

{#if modalType === 'delete' && $selectedProject}
  <DeleteProjectModal
    project={$selectedProject}
    onSuccess={async () => {
      modalType = null
      selectedProject.set(null)
      const companyId = $selectedCompany?.id
      if (companyId) await fetchProjects(companyId)
    }}
    onClose={() => (modalType = null)}
  />
{/if}

{#if $selectedCompany && $selectedCompany}
  <div class="wflex justify-between">
    <ul class="flex space-x-2">
      {#if $companyProjects.length !== 0}
        <li>
          <span class="tooltip tooltip-bottom" data-tip="Projects">
            <span class="flex space-x-2">
              <label
                class="label icon {$selectedProject &&
                $selectedProject.name !== ''
                  ? 'text-accent'
                  : ''}"
                for="project-select"
              >
                <Folder size="16" />
              </label>
              <select
                id="project-select"
                class="select {$selectedProject && $selectedProject.name !== ''
                  ? 'select-accent'
                  : ''}"
                onchange={handleProjectSelect}
              >
                <option value="" selected={!$selectedProject}
                  >Select a project</option
                >
                {#each $companyProjects as project (`unique-project-${project.id}`)}
                  <option
                    value={project.id}
                    selected={$selectedProject &&
                      $selectedProject.id === project.id}
                  >
                    {project.name}
                  </option>
                {/each}
              </select>
            </span>
          </span>
        </li>
      {/if}
      <li>
        <div
          class="tooltip {$selectedProject !== null && $selectedProject.id
            ? 'tooltip-bottom'
            : 'tooltip-right'}"
          data-tip="Add Project"
        >
          <button
            class="btn hover:btn-secondary"
            onclick={() => (modalType = 'add')}><Plus size="16" /></button
          >
        </div>
      </li>
      {#if $selectedProject !== null && $selectedProject.id !== null}
        <li>
          <div class="tooltip tooltip-bottom" data-tip="Edit project">
            <button
              class="btn hover:btn-accent"
              onclick={() => (modalType = 'edit')}
              ><SquarePen size="16" /></button
            >
          </div>
        </li>
        <li>
          <div class="tooltip tooltip-bottom hover:btn-error" data-tip="Delete">
            <button
              class="btn hover:btn-error"
              onclick={() => (modalType = 'delete')}><Trash size="16" /></button
            >
          </div>
        </li>
      {/if}
    </ul>
  </div>
{/if}
