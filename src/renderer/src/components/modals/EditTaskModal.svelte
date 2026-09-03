<script lang="ts">
  let { onClose, onSuccess, task } = $props<{
    task: DBTask
    onClose: () => void
    onSuccess: (editedTask: DBTask) => void
  }>()

  import { onMount } from 'svelte'
  import { activeTasks } from '../../stores'
  import InfoBox from '../InfoBox.svelte'
  import PreviewAttachmentModal from './PreviewAttachmentModal.svelte'
  import {
    formatFileSize,
    isPreviewableMimeType,
  } from '../../lib/attachmentPreview'
  import { Pencil, Trash2, Download, Paperclip, Eye } from '@lucide/svelte'

  let description = $derived(task.description)
  let status = $derived(task.status)
  let issueKey = $state(task.issueKey || '')

  const parseDateTime = (
    value?: string,
  ): { date: string; hour: number; minute: number; second: number } => {
    if (!value) return { date: '', hour: 0, minute: 0, second: 0 }
    const v = value.trim()

    let datePart: string
    let timePart: string

    if (v.includes(' ')) {
      ;[datePart, timePart] = v.split(' ')
    } else if (v.includes('T')) {
      ;[datePart, timePart] = v.split('T')
    } else {
      datePart = v
      timePart = '00:00:00'
    }

    const [hh, mm, ss] = timePart.split(':')
    return {
      date: datePart,
      hour: Number(hh) || 0,
      minute: Number(mm) || 0,
      second: Number(ss) || 0,
    }
  }

  const startParsed = parseDateTime(task.startDateTime)
  const endParsed = parseDateTime(task.endDateTime ?? task.startDateTime)

  let startDate = $state(startParsed.date)
  let startHour = $state(startParsed.hour)
  let startMinute = $state(startParsed.minute)

  let endDate = $state(endParsed.date)
  let endHour = $state(endParsed.hour)
  let endMinute = $state(endParsed.minute)

  let activeTask: ActiveTask | undefined
  let isActive = $state(false)

  let attachments: DBTaskAttachment[] = $state([])
  let attachmentsLoading = $state(false)
  let attachmentError = $state('')
  let renamingId: string | null = $state(null)
  let renameValue = $state('')
  let previewAttachment: DBTaskAttachmentData | null = $state(null)

  const pad = (n: number): string => n.toString().padStart(2, '0')

  async function loadAttachments() {
    attachmentsLoading = true
    attachmentError = ''
    try {
      attachments = await window.electron.listTaskAttachments(task.id)
    } catch (error) {
      console.error('Error loading attachments:', error)
      attachmentError = 'Failed to load attachments'
    } finally {
      attachmentsLoading = false
    }
  }

  onMount(() => {
    loadAttachments()
  })

  $effect(() => {
    activeTask = $activeTasks.find(at => at.taskId === task.id)
    isActive = activeTask !== undefined && activeTask.isActive
  })

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!startDate || !endDate) {
      return
    }

    const startSeconds =
      startDate === startParsed.date &&
      startHour === startParsed.hour &&
      startMinute === startParsed.minute
        ? startParsed.second
        : 0
    const endSeconds =
      endDate === endParsed.date &&
      endHour === endParsed.hour &&
      endMinute === endParsed.minute
        ? endParsed.second
        : 0

    const startDateTime = `${startDate} ${pad(startHour)}:${pad(
      startMinute,
    )}:${pad(startSeconds)}`
    const endDateTime = `${endDate} ${pad(endHour)}:${pad(endMinute)}:${pad(
      endSeconds,
    )}`

    const result = await window.electron.editTask({
      id: task.id,
      taskDefinitionId: task.taskDefinitionId,
      description,
      startDateTime,
      endDateTime,
      status,
      issueKey: issueKey.trim(),
    })

    if (result.success) {
      // Pass edited task back to parent - parent will refresh from database
      onSuccess({
        ...task,
        description,
        startDateTime,
        endDateTime,
        status,
        issueKey: issueKey.trim(),
      })
    }
  }

  async function handleAddAttachments() {
    attachmentError = ''
    const dialogResult = await window.electron.showOpenFileDialog()
    if (dialogResult.canceled || !dialogResult.filePaths.length) {
      return
    }

    const result = await window.electron.addTaskAttachmentsFromPaths(
      task.id,
      dialogResult.filePaths,
    )
    if (result.errors.length > 0) {
      attachmentError = result.errors.join('\n')
    }
    await loadAttachments()
  }

  function startRename(attachment: DBTaskAttachment) {
    renamingId = attachment.id
    renameValue = attachment.filename
    attachmentError = ''
  }

  function cancelRename() {
    renamingId = null
    renameValue = ''
  }

  async function saveRename(id: string) {
    const result = await window.electron.renameTaskAttachment({
      id,
      filename: renameValue,
    })
    if (!result.success) {
      attachmentError = result.error || 'Failed to rename attachment'
      return
    }
    renamingId = null
    renameValue = ''
    attachmentError = ''
    await loadAttachments()
  }

  async function handleDeleteAttachment(attachment: DBTaskAttachment) {
    if (
      !confirm(`Remove attachment "${attachment.filename}" from this entry?`)
    ) {
      return
    }
    attachmentError = ''
    await window.electron.deleteTaskAttachment(attachment.id)
    await loadAttachments()
  }

  async function handleOpenAttachment(attachment: DBTaskAttachment) {
    attachmentError = ''
    const result = await window.electron.openTaskAttachment(attachment.id)
    if (!result.success) {
      attachmentError = result.error || 'Failed to open attachment'
    }
  }

  async function handlePreviewAttachment(attachment: DBTaskAttachment) {
    attachmentError = ''
    if (!isPreviewableMimeType(attachment.mimeType)) {
      await handleOpenAttachment(attachment)
      return
    }
    const data = await window.electron.getTaskAttachmentData(attachment.id)
    if (!data) {
      attachmentError = 'Failed to load attachment'
      return
    }
    previewAttachment = data
  }

  async function handleDownloadAttachment(attachment: DBTaskAttachment) {
    attachmentError = ''
    await window.electron.saveAttachmentToFile(
      attachment.id,
      attachment.filename,
    )
  }
</script>

<div class="modal modal-open">
  <div class="modal-box max-w-2xl">
    <h3 class="font-bold text-lg">Edit Task: {task.name}</h3>
    <form onsubmit={handleSubmit}>
      <label class="label mt-4" for="description">
        <span class="label-text">Task Description</span>
        <span class="tooltip" data-tip="Optional, markdown supported"> *</span>
      </label>
      <div class="form-control">
        <textarea
          id="description"
          bind:value={description}
          class="textarea w-full"
          rows="5"
          placeholder="Task Description"></textarea>
      </div>
      <div class="form-control mt-4">
        <label class="label" for="issueKey">
          <span class="label-text">Issue key</span>
          <span
            class="tooltip"
            data-tip="Optional. Used when syncing to Tempo, e.g. PROJ-42"
          >
            *</span
          >
        </label>
        <input
          id="issueKey"
          type="text"
          bind:value={issueKey}
          class="input input-bordered"
          placeholder="PROJ-42"
        />
      </div>
      <div class="form-control mt-4 {isActive ? 'hidden' : ''}">
        <label class="label">
          <span class="label-text">Start time</span>
        </label>
        <div class="grid grid-cols-3 gap-2">
          <input
            type="date"
            bind:value={startDate}
            class="input input-bordered"
            required
          />
          <input
            type="number"
            min="0"
            max="23"
            bind:value={startHour}
            class="input input-bordered"
            required
          />
          <input
            type="number"
            min="0"
            max="59"
            bind:value={startMinute}
            class="input input-bordered"
            required
          />
        </div>
      </div>
      <div class="form-control mt-4 {isActive ? 'hidden' : ''}">
        <label class="label">
          <span class="label-text">End time</span>
        </label>
        <div class="grid grid-cols-3 gap-2">
          <input
            type="date"
            bind:value={endDate}
            class="input input-bordered"
            required
          />
          <input
            type="number"
            min="0"
            max="23"
            bind:value={endHour}
            class="input input-bordered"
            required
          />
          <input
            type="number"
            min="0"
            max="59"
            bind:value={endMinute}
            class="input input-bordered"
            required
          />
        </div>
      </div>
      <label class="label mt-4" for="status">
        <span class="label-text">Status</span>
        <span
          class="tooltip tooltip-right"
          data-tip="Inactive tasks are hidden from selection. Like archived."
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
      <div class="modal-action">
        <button type="submit" class="btn btn-warning">Edit</button>
        <button type="button" class="btn" onclick={onClose}>Cancel</button>
      </div>
    </form>

    <div class="divider mt-2">Attachments</div>
    <div class="flex items-center justify-between gap-2 mb-2">
      <span class="text-sm opacity-70"
        >{attachments.length} file{attachments.length === 1 ? '' : 's'}</span
      >
      <button
        type="button"
        class="btn btn-sm btn-primary"
        onclick={handleAddAttachments}
      >
        <Paperclip class="w-4 h-4" />
        Add files
      </button>
    </div>

    {#if attachmentError}
      <div class="alert alert-error text-sm whitespace-pre-wrap mb-2">
        {attachmentError}
      </div>
    {/if}

    {#if attachmentsLoading}
      <p class="text-sm opacity-70">Loading attachments...</p>
    {:else if attachments.length === 0}
      <p class="text-sm opacity-70">No attachments yet.</p>
    {:else}
      <ul class="space-y-2 max-h-60 overflow-auto">
        {#each attachments as attachment (attachment.id)}
          <li
            class="flex items-center gap-2 p-2 rounded bg-base-200 border border-base-300"
          >
            {#if renamingId === attachment.id}
              <input
                class="input input-bordered input-sm flex-1"
                bind:value={renameValue}
                onkeydown={(e: KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    saveRename(attachment.id)
                  } else if (e.key === 'Escape') {
                    cancelRename()
                  }
                }}
              />
              <button
                type="button"
                class="btn btn-xs btn-success"
                onclick={() => saveRename(attachment.id)}>Save</button
              >
              <button type="button" class="btn btn-xs" onclick={cancelRename}
                >Cancel</button
              >
            {:else}
              <button
                type="button"
                class="btn btn-link btn-sm px-0 flex-1 justify-start text-left break-all normal-case no-underline"
                onclick={() => handleOpenAttachment(attachment)}
                title="Open externally"
              >
                {attachment.filename}
              </button>
              <span class="text-xs opacity-60 whitespace-nowrap"
                >{formatFileSize(attachment.size)}</span
              >
              {#if isPreviewableMimeType(attachment.mimeType)}
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  title="Preview"
                  onclick={() => handlePreviewAttachment(attachment)}
                >
                  <Eye class="w-3.5 h-3.5" />
                </button>
              {/if}
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                title="Rename"
                onclick={() => startRename(attachment)}
              >
                <Pencil class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                title="Download"
                onclick={() => handleDownloadAttachment(attachment)}
              >
                <Download class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-xs text-error"
                title="Remove"
                onclick={() => handleDeleteAttachment(attachment)}
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if isActive}
      <div class="mt-4">
        <InfoBox type="info" title="Running task">
          Start/end times are locked while this task is running.
        </InfoBox>
      </div>
    {/if}
  </div>
  <div
    class="modal-backdrop"
    onkeypress={(evt: KeyboardEvent) => evt.key === 'Escape' && onClose()}
    role="button"
    tabindex="0"
  ></div>
</div>

{#if previewAttachment}
  <PreviewAttachmentModal
    attachment={previewAttachment}
    onClose={() => (previewAttachment = null)}
  />
{/if}
