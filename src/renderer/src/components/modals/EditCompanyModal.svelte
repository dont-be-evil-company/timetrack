<script lang="ts">
  let { onClose, onSuccess, company } = $props<{
    company: DBCompany
    onClose: () => void
    onSuccess: (company: DBCompany) => void
  }>()
  import { onMount } from 'svelte'
  import {
    companies,
    selectedCompany,
    selectedProject,
    selectedTask,
    selectedTaskDefinition,
  } from '../../stores'

  let name = $derived(company.name)
  let status = $derived(company.status || 'active')
  let tempoConnection = $state(company.tempoConnection || '')
  let tempoConnections: string[] = $state([])

  onMount(async () => {
    if (window.electron) {
      tempoConnections = await window.electron.getTempoConnections()
    }
  })

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (window.electron) {
      const nextConnection = tempoConnection.trim() || null
      const result = await window.electron.editCompany({
        id: company.id,
        name,
        status,
        tempoConnection: nextConnection,
      })

      if (result.success) {
        if (status === 'active') {
          companies.update(cs =>
            cs.map(c =>
              c.id === company.id
                ? { ...c, name, status, tempoConnection: nextConnection }
                : c,
            ),
          )
        }
        selectedCompany.update(c =>
          c && c.id === company.id
            ? { ...c, name, status, tempoConnection: nextConnection }
            : c,
        )
        if (status !== 'active') {
          selectedProject.set(null)
          selectedTaskDefinition.set(null)
          selectedTask.set(null)
          selectedCompany.set(null)
          await onSuccess(null)
          return
        }

        onSuccess({
          id: company.id,
          name,
          status,
          tempoConnection: nextConnection,
        })
      }
    }
  }
</script>

<div class="modal modal-open">
  <div class="modal-box">
    <h3 class="font-bold text-lg">Edit Company: {company.name}</h3>
    <form onsubmit={handleSubmit}>
      <div class="form-control mt-4">
        <label class="label" for="companyName">
          <span class="label-text">Name</span>
        </label>
        <input
          id="companyName"
          type="text"
          bind:value={name}
          class="input input-bordered"
          required
        />
      </div>
      <label class="label mt-4" for="status">
        <span class="label-text">Status</span>
        <span
          class="tooltip tooltip-right"
          data-tip="Inactive companies are hidden from selection. Like archived."
        >
          *</span
        >
      </label>
      <div class="form-control">
        <select bind:value={status} class="select w-auto" required id="status">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      {#if tempoConnections.length > 0}
        <div class="form-control mt-4">
          <label class="label" for="tempoConnection">
            <span class="label-text">Tempo connection</span>
          </label>
          <select
            id="tempoConnection"
            bind:value={tempoConnection}
            class="select select-bordered"
          >
            <option value="">None</option>
            {#each tempoConnections as connectionName (connectionName)}
              <option value={connectionName}>{connectionName}</option>
            {/each}
          </select>
        </div>
      {/if}
      <div class="modal-action">
        <button type="submit" class="btn btn-success">Edit</button>
        <button type="button" class="btn" onclick={onClose}>Cancel</button>
      </div>
    </form>
  </div>
  <div
    class="modal-backdrop"
    onkeypress={(evt: KeyboardEvent) => evt.key === 'Escape' && onClose()}
    role="button"
    tabindex="0"
  ></div>
</div>
