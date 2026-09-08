<script lang="ts">
  import { untrack } from 'svelte'
  import { Check, ExternalLink, Search, X } from '@lucide/svelte'

  let { companyId, onSelect, onClose } = $props<{
    companyId: string
    onSelect: (issueKey: string) => void
    onClose: () => void
  }>()

  let searchText = $state('')
  let projectKey = $state('')
  let statusId = $state('')
  let assigneeId = $state('')
  let assigneeQuery = $state('')
  let assigneeUsers: JiraUserSearchHit[] = $state([])
  let showAssigneeMenu = $state(false)
  let selectedAssigneeLabel = $state('')

  let projects: JiraIssueProjectOption[] = $state([])
  let statuses: JiraIssueStatusOption[] = $state([])
  let issues: JiraIssueSearchHit[] = $state([])
  let loading = $state(false)
  let loadingMore = $state(false)
  let filtersError = $state('')
  let searchError = $state('')
  let nextPageToken = $state<string | undefined>(undefined)
  let nextStartAt = $state<number | undefined>(undefined)
  let hasMore = $state(false)
  let searchGeneration = 0

  const hasActiveFilters = $derived(
    Boolean(projectKey || statusId || assigneeId),
  )

  const formatCreated = (value?: string): string => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusBadgeClass = (category?: string): string => {
    if (category === 'done') return 'badge-success'
    if (category === 'indeterminate') return 'badge-info'
    return 'badge-ghost'
  }

  const currentQuery = (): JiraIssueSearchQuery => ({
    text: searchText.trim() || undefined,
    projectKey: projectKey || undefined,
    statusId: statusId || undefined,
    assignee: assigneeId || undefined,
    assigneeDisplayName: selectedAssigneeLabel || undefined,
  })

  const runSearch = async (append = false) => {
    const generation = ++searchGeneration
    if (append) {
      loadingMore = true
    } else {
      loading = true
      searchError = ''
      hasMore = false
      nextPageToken = undefined
      nextStartAt = undefined
    }
    try {
      const query: JiraIssueSearchQuery = {
        ...currentQuery(),
        nextPageToken: append ? nextPageToken : undefined,
        startAt: append ? nextStartAt : undefined,
      }
      const result = await window.electron.searchJiraIssues(companyId, query)
      if (generation !== searchGeneration) return
      if (!result.success) {
        searchError = result.error || 'Failed to search issues'
        if (!append) issues = []
        return
      }
      issues = append ? [...issues, ...result.issues] : result.issues
      nextPageToken = result.nextPageToken
      nextStartAt =
        result.startAt !== undefined
          ? result.startAt + result.issues.length
          : undefined
      hasMore = Boolean(result.hasMore)
    } catch (error) {
      if (generation !== searchGeneration) return
      searchError =
        error instanceof Error ? error.message : 'Failed to search issues'
      if (!append) issues = []
    } finally {
      if (generation === searchGeneration) {
        loading = false
        loadingMore = false
      }
    }
  }

  const loadFilters = async (selectedProjectKey = projectKey) => {
    filtersError = ''
    const { currentStatusId, previousStatusName } = untrack(() => ({
      currentStatusId: statusId,
      previousStatusName: statuses.find(status => status.id === statusId)?.name,
    }))
    const result = await window.electron.getJiraIssueFilters(
      companyId,
      selectedProjectKey || undefined,
    )
    if (!result.success) {
      filtersError = result.error || 'Failed to load filters'
      return
    }
    projects = result.projects
    statuses = result.statuses
    if (
      currentStatusId &&
      !statuses.some(status => status.id === currentStatusId)
    ) {
      statusId =
        statuses.find(status => status.name === previousStatusName)?.id ?? ''
    }
  }

  const searchUsers = async (query: string) => {
    if (!query.trim()) {
      assigneeUsers = []
      return
    }
    const result = await window.electron.searchJiraUsers(companyId, query)
    if (result.success) {
      assigneeUsers = result.users
    }
  }

  const clearFilters = () => {
    projectKey = ''
    statusId = ''
    assigneeId = ''
    assigneeQuery = ''
    selectedAssigneeLabel = ''
    assigneeUsers = []
    showAssigneeMenu = false
  }

  const selectAssignee = (user: JiraUserSearchHit) => {
    assigneeId = user.id
    selectedAssigneeLabel = user.displayName
    assigneeQuery = user.displayName
    showAssigneeMenu = false
  }

  const selectUnassigned = () => {
    assigneeId = 'unassigned'
    selectedAssigneeLabel = 'Unassigned'
    assigneeQuery = 'Unassigned'
    showAssigneeMenu = false
  }

  const onAssigneeInput = () => {
    selectedAssigneeLabel = ''
    assigneeId = ''
    showAssigneeMenu = true
  }

  const openIssue = async (issueKey: string) => {
    await window.electron.openJiraIssue(companyId, issueKey)
  }

  $effect(() => {
    const selectedProjectKey = projectKey
    void loadFilters(selectedProjectKey)
  })

  $effect(() => {
    void searchText
    void projectKey
    void statusId
    void assigneeId
    const timeout = setTimeout(() => {
      void runSearch(false)
    }, 300)
    return () => clearTimeout(timeout)
  })

  $effect(() => {
    const query = assigneeQuery
    if (!showAssigneeMenu || selectedAssigneeLabel) return
    const timeout = setTimeout(() => {
      void searchUsers(query)
    }, 300)
    return () => clearTimeout(timeout)
  })
</script>

<div class="modal modal-open z-[1100]">
  <div
    class="modal-box flex h-[90vh] max-h-[90vh] w-11/12 max-w-[95vw] flex-col"
    role="dialog"
    aria-modal="true"
    aria-labelledby="issue-picker-title"
    tabindex="-1"
    onkeydown={(evt: KeyboardEvent) => {
      if (evt.key === 'Enter') evt.preventDefault()
      if (evt.key === 'Escape') onClose()
    }}
  >
    <div class="flex items-start justify-between gap-4">
      <h3 id="issue-picker-title" class="text-lg font-bold">Find issue</h3>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-square"
        onclick={onClose}
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="relative z-10 mt-4 flex flex-wrap items-end gap-2">
      <label class="form-control min-w-56 flex-1">
        <span class="label-text mb-1">Search issues</span>
        <div class="input input-bordered w-full">
          <Search class="h-4 w-4 shrink-0 opacity-70" />
          <input
            type="text"
            class="min-w-0 grow"
            placeholder="Search issues"
            bind:value={searchText}
          />
        </div>
      </label>
      <label class="form-control w-44">
        <span class="label-text mb-1">Project</span>
        <select class="select select-bordered" bind:value={projectKey}>
          <option value="">All projects</option>
          {#each projects as project (project.key)}
            <option value={project.key}>{project.key} · {project.name}</option>
          {/each}
        </select>
      </label>
      <div class="form-control w-52 relative">
        <span class="label-text mb-1">Assignee</span>
        <input
          type="text"
          class="input input-bordered"
          placeholder="Anyone"
          bind:value={assigneeQuery}
          onfocus={() => (showAssigneeMenu = true)}
          oninput={onAssigneeInput}
          onblur={() => {
            setTimeout(() => {
              showAssigneeMenu = false
            }, 150)
          }}
        />
        {#if showAssigneeMenu}
          <ul
            class="menu bg-base-200 rounded-box absolute top-full z-50 mt-1 w-full border border-base-300 shadow"
          >
            <li>
              <button type="button" onclick={selectUnassigned}
                >Unassigned</button
              >
            </li>
            {#each assigneeUsers as user (user.id)}
              <li>
                <button type="button" onclick={() => selectAssignee(user)}
                  >{user.displayName}</button
                >
              </li>
            {/each}
          </ul>
        {/if}
      </div>
      <label class="form-control w-44">
        <span class="label-text mb-1">Status</span>
        <select class="select select-bordered" bind:value={statusId}>
          <option value="">All statuses</option>
          {#each statuses as status (status.id)}
            <option value={status.id}>{status.name}</option>
          {/each}
        </select>
      </label>
      {#if hasActiveFilters}
        <button type="button" class="btn btn-ghost" onclick={clearFilters}>
          Clear filters
        </button>
      {/if}
    </div>

    {#if filtersError}
      <div role="alert" class="alert alert-error mt-4">
        <span>{filtersError}</span>
      </div>
    {/if}
    {#if searchError}
      <div role="alert" class="alert alert-error mt-4">
        <span>{searchError}</span>
      </div>
    {/if}

    <div class="mt-4 min-h-0 flex-1 overflow-auto">
      {#if loading}
        <div class="flex h-40 items-center justify-center">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      {:else if issues.length === 0}
        <p class="text-base-content/70 py-8 text-center text-sm">
          No issues matched this search.
        </p>
      {:else}
        <table class="table table-sm table-pin-rows">
          <thead>
            <tr>
              <th>Issue</th>
              <th>Assignee</th>
              <th>Reporter</th>
              <th>Status</th>
              <th>Resolution</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each issues as issue (issue.key)}
              <tr>
                <td>
                  <div class="flex items-start gap-2">
                    {#if issue.issueTypeIconUrl}
                      <img
                        src={issue.issueTypeIconUrl}
                        alt={issue.issueTypeName}
                        title={issue.issueTypeName}
                        class="mt-0.5 h-4 w-4 shrink-0"
                        onerror={event => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                    {/if}
                    <div>
                      <div class="font-medium text-info">{issue.key}</div>
                      <div class="text-sm">{issue.summary}</div>
                    </div>
                  </div>
                </td>
                <td>{issue.assigneeName || 'Unassigned'}</td>
                <td>{issue.reporterName || '-'}</td>
                <td>
                  <span
                    class="badge badge-sm badge-soft h-auto min-h-5 whitespace-nowrap py-1 leading-none {statusBadgeClass(
                      issue.statusCategory,
                    )}">{issue.statusName || '-'}</span
                  >
                </td>
                <td>{issue.resolution || 'Unresolved'}</td>
                <td class="whitespace-nowrap">{formatCreated(issue.created)}</td
                >
                <td>
                  <div class="flex gap-1">
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      title="Select issue key"
                      onclick={() => onSelect(issue.key)}
                    >
                      <Check class="h-3.5 w-3.5" />
                      Select
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs"
                      title="Open issue"
                      onclick={() => openIssue(issue.key)}
                    >
                      <ExternalLink class="h-3.5 w-3.5" />
                      Open
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if hasMore}
          <div class="py-4 text-center">
            <button
              type="button"
              class="btn btn-sm"
              disabled={loadingMore}
              onclick={() => runSearch(true)}
            >
              {#if loadingMore}
                <span class="loading loading-spinner loading-xs"></span>
              {/if}
              Load more
            </button>
          </div>
        {/if}
      {/if}
    </div>

    <div class="modal-action">
      <button type="button" class="btn" onclick={onClose}>Close</button>
    </div>
  </div>
  <div
    class="modal-backdrop"
    onkeypress={(evt: KeyboardEvent) => evt.key === 'Escape' && onClose()}
    onclick={onClose}
    role="button"
    tabindex="0"
  ></div>
</div>
