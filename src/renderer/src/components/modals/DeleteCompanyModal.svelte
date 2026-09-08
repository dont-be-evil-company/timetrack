<script lang="ts">
  let { onClose, onSuccess, company } = $props<{
    company: DBCompany
    onClose: () => void
    onSuccess: () => void
  }>()
  import {
    companies,
    selectedCompany,
    selectedProject,
    projects,
  } from '../../stores'
  import InfoBox from '../InfoBox.svelte'

  async function handleDelete() {
    if (window.electron) {
      const result = await window.electron.deleteCompany(company.id)
      if (result.success) {
        companies.update(cs => cs.filter(c => c.id !== company.id))
        // Clear selection if deleted company was selected
        if ($selectedCompany?.id === company.id) {
          selectedCompany.set(null)
          selectedProject.set(null)
        }
        onSuccess()
      }
    }
  }

  let companyProjects: DBProject[] = $derived([])

  $effect(() => {
    companyProjects = $projects.filter(p => p.companyId === company.id)
  })
</script>

<div class="modal modal-open">
  <div class="modal-box">
    <h3 class="font-bold text-lg">Delete Company</h3>
    {#if companyProjects.length > 0}
      <InfoBox type="warning" title="Warning">
        This company has {companyProjects.length} project(s). Deleting it will also
        delete all associated projects, tasks, and task definitions.
      </InfoBox>
    {/if}
    <p class="py-4">
      Are you sure you want to delete the company <strong>{company.name}</strong
      >?
    </p>
    <div class="modal-action">
      <button type="button" class="btn btn-error" onclick={handleDelete}>
        Delete
      </button>
      <button type="button" class="btn" onclick={onClose}>Cancel</button>
    </div>
  </div>
  <div
    class="modal-backdrop"
    onkeypress={(evt: KeyboardEvent) => evt.key === 'Escape' && onClose()}
    role="button"
    tabindex="0"
  ></div>
</div>
