<script lang="ts">
  import { selectedPanel, activeTasks, companies, issuePicker } from './stores'
  import Navigation from './components/Navigation.svelte'
  import Overview from './components/Overview.svelte'
  import Search from './components/Search.svelte'
  import PDFExport from './components/PDFExport.svelte'
  import IssuePickerModal from './components/modals/IssuePickerModal.svelte'
  import { onMount } from 'svelte'

  let loadError: string | null = $state(null)
  let appReady: boolean = $state(false)
  let searchVisited = $state(false)

  $effect(() => {
    if ($selectedPanel === 'Search') {
      searchVisited = true
    }
  })

  async function loadInitialData() {
    try {
      const companiesData = await window.electron.getCompanies()
      companies.set(companiesData)

      const activeTasksData = await window.electron.getActiveTasks()
      activeTasks.set(activeTasksData)

      loadError = null
    } catch (error) {
      console.error('Error loading initial data:', error)
      loadError = 'Failed to load initial data. Please restart the app.'
    }
  }
  $effect(() => {
    if (appReady) {
      loadInitialData()
    }
  })
  onMount(() => {
    window.electron.on('app-ready', () => {
      appReady = true
    })

    // When window is restored from tray, refresh active tasks to get correct elapsed time
    window.electron.on('window-restored', async () => {
      try {
        const activeTasksData = await window.electron.getActiveTasks()
        activeTasks.set(activeTasksData)
      } catch (error) {
        console.error('Error refreshing active tasks on restore:', error)
      }
    })
  })
</script>

<div class="min-h-screen bg-base-100">
  {#if appReady === false}
    <div class="flex h-screen items-center justify-center">
      <div class="text-center space-y-4">
        <div class="loading loading-spinner loading-lg mx-auto"></div>
        <p class="text-sm text-base-content/70">
          Initializing database and loading data&hellip;
        </p>
      </div>
    </div>
  {:else if loadError}
    <div class="flex h-screen items-center justify-center">
      <div class="text-center space-y-4 max-w-md px-4">
        <p class="font-semibold text-error mb-2">Something went wrong</p>
        <p class="text-sm text-base-content/80">{loadError}</p>
      </div>
    </div>
  {:else}
    {#if $selectedPanel !== 'PDFDocument'}
      <Navigation
        currentPanel={$selectedPanel}
        onPanelChange={panel => selectedPanel.set(panel)}
      />
    {/if}

    <div class="w-full p-4">
      <div hidden={$selectedPanel !== 'Overview'}>
        <Overview />
      </div>
      {#if searchVisited}
        <div hidden={$selectedPanel !== 'Search'}>
          <Search />
        </div>
      {/if}
      {#if $selectedPanel === 'PDFDocument'}
        <PDFExport />
      {/if}
    </div>
  {/if}
</div>

{#if $issuePicker}
  <IssuePickerModal
    companyId={$issuePicker.companyId}
    onSelect={$issuePicker.onSelect}
    onClose={() => issuePicker.set(null)}
  />
{/if}
