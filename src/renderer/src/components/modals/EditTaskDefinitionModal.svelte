<script lang="ts">
  let { onClose, onSuccess, taskDefinition } = $props<{
    taskDefinition: DBTaskDefinition
    onSuccess: (editTaskDefinition: DBTaskDefinition) => void
    onClose: () => void
  }>()
  import { untrack } from 'svelte'
  import {
    selectedTask,
    selectedTaskDefinition,
    taskDefinitions,
  } from '../../stores'
  import IssueKeyField from '../IssueKeyField.svelte'

  let taskDefName = $derived(taskDefinition && taskDefinition.name)
  let status: 'active' | 'inactive' = $derived(
    taskDefinition && taskDefinition.status,
  )
  let issueKey = $state(untrack(() => taskDefinition.issueKey || ''))

  async function handleSubmit(e: Event) {
    e.preventDefault()
    const result = await window.electron.editTaskDefinition({
      id: taskDefinition.id,
      name: taskDefName,
      status: status,
      issueKey,
    })

    if (result.success) {
      // Update stores
      taskDefinitions.update(tds =>
        tds.map(td =>
          td.id === taskDefinition.id
            ? { ...td, name: taskDefName, status, issueKey }
            : td,
        ),
      )
      selectedTaskDefinition.update(td =>
        td && td.id === taskDefinition.id
          ? { ...td, name: taskDefName, status, issueKey }
          : td,
      )
      if (status === 'inactive') {
        selectedTask.set(null)
        selectedTaskDefinition.set(null)
      }

      onSuccess({
        ...taskDefinition,
        name: taskDefName,
        status,
        issueKey,
      })
    }
  }
</script>

<div class="modal modal-open">
  <div class="modal-box">
    <h3 class="font-bold text-lg">Edit Task Definition</h3>
    <form onsubmit={handleSubmit}>
      <div class="form-control mt-4">
        <label class="label" for="taskDefName">
          <span class="label-text">Task Definition Name</span>
        </label>
        <input
          id="taskDefName"
          type="text"
          bind:value={taskDefName}
          class="input input-bordered"
          required
        />
      </div>
      <IssueKeyField
        bind:value={issueKey}
        label="Default issue key"
        companyId={taskDefinition.companyId}
      />
      <div class="form-control mt-4">
        <label class="label" for="status">
          <span class="label-text">Status</span>
        </label>
        <select
          bind:value={status}
          class="select select-bordered"
          required
          id="status"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <div class="modal-action">
        <button type="submit" class="btn btn-warning">Edit</button>
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
