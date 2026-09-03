<script lang="ts">
  import { onMount } from 'svelte'
  import { companies, selectedCompany, selectedProject } from '../stores'
  import AddCompanyModal from './modals/AddCompanyModal.svelte'
  import EditCompanyModal from './modals/EditCompanyModal.svelte'
  import DeleteCompanyModal from './modals/DeleteCompanyModal.svelte'
  import TempoSyncResultModal from './modals/TempoSyncResultModal.svelte'
  import { Plus, SquarePen, Store, Trash, RefreshCw } from '@lucide/svelte'

  let companiesList: DBCompany[] = $state([])
  let showEditModal = $state(false)
  let showDeleteModal = $state(false)
  let showAddModal = $state(false)
  let companyToDelete: DBCompany | null = null
  let syncing = $state(false)
  let syncResult: TempoSyncResult | null = $state(null)

  companies.subscribe(value => {
    companiesList = value
  })

  onMount(async () => {
    await fetchCompanies()
  })

  async function fetchCompanies() {
    if (window.electron) {
      try {
        const data = await window.electron.getCompanies('active')
        companies.set(data)
      } catch (error) {
        console.error('Error loading companies:', error)
      }
    }
  }

  function handleCompanySelect(e: Event) {
    const select = e.target as HTMLSelectElement
    const companyId = select.value
    if (companyId === '') {
      selectedCompany.set(null)
      selectedProject.set(null)
      return
    }
    const company = companiesList.find(c => c.id === companyId) || null
    selectedCompany.set(company)
    // Clear selected project when company changes
    selectedProject.set(null)
  }

  function handleEditClick() {
    showEditModal = true
  }

  function handleDeleteClick() {
    showDeleteModal = true
  }

  async function handleCompanyAddModalSuccess() {
    showAddModal = false
    await fetchCompanies()
  }

  async function handleCompanyAddModalClose() {
    showAddModal = false
  }

  async function handleCompanyDeleteModalSuccess() {
    showDeleteModal = false
    await fetchCompanies()
    if (companyToDelete) {
      // Clear selection if deleted company was selected
      if ($selectedCompany.id === companyToDelete.id) {
        selectedCompany.set(null)
        selectedProject.set(null)
      }
    }
    companyToDelete = null
  }
  async function handleCompanyEditModalSuccess(editedCompany: DBCompany) {
    showEditModal = false
    await fetchCompanies()
    if (editedCompany) {
      // Update selected company if it was edited
      selectedCompany.set(editedCompany)
    }
  }

  async function handleSyncToTempo() {
    if (!window.electron || !$selectedCompany?.id || syncing) return
    syncing = true
    try {
      syncResult = await window.electron.syncCompanyToTempo($selectedCompany.id)
    } catch (error) {
      console.error('Error syncing to Tempo:', error)
      syncResult = {
        success: false,
        error: 'Failed to sync to Tempo',
        created: 0,
        updated: 0,
        skipped: 0,
        unchanged: 0,
        failed: 0,
        items: [],
      }
    } finally {
      syncing = false
    }
  }
</script>

<div class="flex justify-between">
  <ul class="flex space-x-2">
    {#if $companies.length !== 0}
      <li>
        <span class="tooltip tooltip-bottom" data-tip="Companies">
          <span class="flex space-x-2">
            <label
              class="label icon {$selectedCompany &&
              $selectedCompany.name !== ''
                ? 'text-accent'
                : ''}"
              for="company-select"
            >
              <Store size="16" />
            </label>
            <select
              id="company-select"
              class="select {$selectedCompany && $selectedCompany.name !== ''
                ? 'select-accent'
                : ''}"
              onchange={handleCompanySelect}
            >
              <option value="" selected={!$selectedCompany}
                >Select a company</option
              >
              {#each $companies as company (`unique-company-${company.id}`)}
                <option
                  value={company.id}
                  selected={$selectedCompany &&
                    $selectedCompany.id === company.id}
                >
                  {company.name}
                </option>
              {/each}
            </select>
          </span>
        </span>
      </li>
    {/if}
    <li>
      <div
        class="tooltip {$selectedCompany && $selectedCompany.id
          ? 'tooltip-bottom'
          : 'tooltip-right'}"
        data-tip="Add a company"
      >
        <button
          class="btn hover:btn-secondary"
          onclick={() => (showAddModal = true)}><Plus size="16" /></button
        >
      </div>
    </li>
    {#if $selectedCompany && $selectedCompany.id}
      <li>
        <div class="tooltip tooltip-bottom" data-tip="Edit company">
          <button class="btn hover:btn-accent" onclick={handleEditClick}
            ><SquarePen size="16" /></button
          >
        </div>
      </li>
      <li>
        <div
          class="tooltip tooltip-bottom hover:btn-error"
          data-tip="Delete company"
        >
          <button class="btn hover:btn-error" onclick={handleDeleteClick}
            ><Trash size="16" /></button
          >
        </div>
      </li>
      {#if $selectedCompany.tempoConnection}
        <li>
          <div class="tooltip tooltip-bottom" data-tip="Sync to Tempo">
            <button
              class="btn hover:btn-accent"
              onclick={handleSyncToTempo}
              disabled={syncing}
            >
              {#if syncing}
                <span class="loading loading-spinner loading-sm"></span>
              {:else}
                <RefreshCw size="16" />
              {/if}
            </button>
          </div>
        </li>
      {/if}
    {/if}
  </ul>
</div>

{#if showAddModal}
  <AddCompanyModal
    onSuccess={handleCompanyAddModalSuccess}
    onClose={handleCompanyAddModalClose}
  />
{/if}

{#if showEditModal && $selectedCompany}
  <EditCompanyModal
    company={$selectedCompany}
    onSuccess={c => handleCompanyEditModalSuccess(c)}
    onClose={() => {
      showEditModal = false
    }}
  />
{/if}

{#if syncResult}
  <TempoSyncResultModal
    result={syncResult}
    onClose={() => {
      syncResult = null
    }}
  />
{/if}

{#if showDeleteModal && $selectedCompany}
  <DeleteCompanyModal
    company={$selectedCompany}
    onSuccess={() => handleCompanyDeleteModalSuccess()}
    onClose={() => {
      showDeleteModal = false
    }}
  />
{/if}
