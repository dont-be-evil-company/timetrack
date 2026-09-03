<script lang="ts">
  let { result, onClose } = $props<{
    result: TempoSyncResult
    onClose: () => void
  }>()

  const statusFilters: {
    status: TempoSyncItemStatus
    count: number
    label: string
    badgeClass: string
  }[] = [
    {
      status: 'created',
      count: result.created,
      label: 'created',
      badgeClass: 'badge-success',
    },
    {
      status: 'updated',
      count: result.updated,
      label: 'updated',
      badgeClass: 'badge-info',
    },
    {
      status: 'skipped',
      count: result.skipped,
      label: 'skipped',
      badgeClass: 'badge-ghost',
    },
    {
      status: 'unchanged',
      count: result.unchanged,
      label: 'unchanged',
      badgeClass: 'badge-ghost',
    },
    {
      status: 'failed',
      count: result.failed,
      label: 'failed',
      badgeClass: 'badge-error',
    },
  ]

  let visible = $state<Record<TempoSyncItemStatus, boolean>>({
    created: true,
    updated: true,
    skipped: false,
    unchanged: false,
    failed: true,
  })

  const visibleItems = $derived(
    result.items.filter(item => visible[item.status]),
  )

  const statusLabel = (status: TempoSyncItemStatus) => {
    switch (status) {
      case 'created':
        return 'Created'
      case 'updated':
        return 'Updated'
      case 'skipped':
        return 'Skipped'
      case 'unchanged':
        return 'Unchanged'
      case 'failed':
        return 'Failed'
    }
  }

  const statusClass = (status: TempoSyncItemStatus) => {
    switch (status) {
      case 'created':
        return 'badge-success'
      case 'updated':
        return 'badge-info'
      case 'skipped':
        return 'badge-ghost'
      case 'unchanged':
        return 'badge-ghost'
      case 'failed':
        return 'badge-error'
    }
  }

  const toggleStatus = (status: TempoSyncItemStatus) => {
    visible[status] = !visible[status]
  }
</script>

<div class="modal modal-open">
  <div class="modal-box max-w-2xl">
    <h3 class="font-bold text-lg">Tempo sync</h3>
    {#if result.error}
      <div role="alert" class="alert alert-error mt-4">
        <span>{result.error}</span>
      </div>
    {/if}
    <div class="mt-4 flex flex-wrap gap-2 text-sm">
      {#each statusFilters as filter (filter.status)}
        <button
          type="button"
          class="badge {filter.badgeClass} cursor-pointer border-transparent {visible[
            filter.status
          ]
            ? ''
            : 'badge-outline opacity-40'}"
          aria-pressed={visible[filter.status]}
          aria-label="{visible[filter.status] ? 'Hide' : 'Show'} {filter.label} entries"
          onclick={() => toggleStatus(filter.status)}
        >
          {filter.count}
          {filter.label}
        </button>
      {/each}
    </div>
    {#if result.items.length > 0}
      <div class="mt-4 max-h-80 overflow-y-auto">
        {#if visibleItems.length > 0}
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Task</th>
                <th>Issue</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {#each visibleItems as item (item.taskId + item.status + (item.message || ''))}
                <tr>
                  <td>{item.taskName}</td>
                  <td>{item.issueKey || '-'}</td>
                  <td>
                    <span class="badge {statusClass(item.status)}"
                      >{statusLabel(item.status)}</span
                    >
                  </td>
                  <td class="text-sm text-base-content/70"
                    >{item.message || ''}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="text-sm text-base-content/70 py-2">
            No entries for the selected statuses.
          </p>
        {/if}
      </div>
    {/if}
    <div class="modal-action">
      <button type="button" class="btn" onclick={onClose}>Close</button>
    </div>
  </div>
  <div
    class="modal-backdrop"
    onkeypress={(evt: KeyboardEvent) => evt.key === 'Escape' && onClose()}
    role="button"
    tabindex="0"
  ></div>
</div>
