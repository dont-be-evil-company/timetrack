<script lang="ts">
  import { ExternalLink, Search } from '@lucide/svelte'
  import { companies, issuePicker } from '../stores'

  let {
    id = 'issueKey',
    label = 'Issue key',
    tooltip,
    placeholder = 'PROJ-42',
    companyId,
    value = $bindable(''),
  } = $props<{
    id?: string
    label?: string
    tooltip?: string
    placeholder?: string
    companyId?: string | null
    value: string
  }>()

  let opening = $state(false)

  const hasTempo = $derived.by(() => {
    if (!companyId) return false
    const company = $companies.find(c => c.id === companyId)
    return Boolean(company?.tempoConnection?.trim())
  })

  const trimmedKey = $derived(value.trim())

  const openIssue = async () => {
    if (!companyId || !trimmedKey || opening) return
    opening = true
    try {
      await window.electron.openJiraIssue(companyId, trimmedKey)
    } finally {
      opening = false
    }
  }
</script>

<div class="form-control mt-4">
  <label class="label" for={id}>
    <span class="label-text">{label}</span>
    {#if tooltip}
      <span class="tooltip" data-tip={tooltip}>*</span>
    {/if}
  </label>
  {#if hasTempo && companyId}
    <div class="input input-bordered w-full">
      <input {id} type="text" class="min-w-0 grow" bind:value {placeholder} />
      <div class="tooltip tooltip-top" data-tip="Find issue">
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-square cursor-pointer"
          aria-label="Find issue"
          onclick={() => {
            if (!companyId) return
            issuePicker.set({
              companyId,
              onSelect: key => {
                value = key
                issuePicker.set(null)
              },
            })
          }}
        >
          <Search class="h-4 w-4 opacity-70" />
        </button>
      </div>
      {#if trimmedKey}
        <div class="tooltip tooltip-top" data-tip="Open issue">
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-square cursor-pointer"
            aria-label="Open issue"
            disabled={opening}
            onclick={openIssue}
          >
            <ExternalLink class="h-4 w-4 opacity-70" />
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <input
      {id}
      type="text"
      bind:value
      class="input input-bordered"
      {placeholder}
    />
  {/if}
</div>
