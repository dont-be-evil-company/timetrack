<script lang="ts">
  let { onClose, onSuccess, project } = $props<{
    project: DBProject
    onSuccess: () => void
    onClose: () => void
  }>()
  import { projects, selectedProject } from '../../stores'
  import InfoBox from '../InfoBox.svelte'

  async function handleConfirm() {
    const result = await window.electron.deleteProject(project.id)
    if (result.success) {
      projects.update(ps => ps.filter(p => p.id !== project.id))
      if ($selectedProject?.id === project.id) {
        selectedProject.set(null)
      }
      onSuccess()
    }
  }
</script>

<div class="modal modal-open">
  <div class="modal-box">
    <h3 class="font-bold text-lg">Delete Project</h3>
    <InfoBox type="error" title="Warning">
      <p>Deleting a project is a hazardous action.</p>
      <p>
        If you delete a project, it'll also delete all its tasks and
        task-definitions.
      </p>
      <p>Maybe consider marking it as inactive?</p>
    </InfoBox>
    <p class="mt-4">
      Are you sure you want to delete this project ({project.name})?
    </p>
    <div class="modal-action">
      <button class="btn btn-error" onclick={handleConfirm}>Yes</button>
      <button class="btn btn-primary" onclick={onClose}>No</button>
    </div>
  </div>
  <div
    class="modal-backdrop"
    onkeypress={(evt: KeyboardEvent) => evt.key === 'Escape' && onClose()}
    role="button"
    tabindex="0"
  ></div>
</div>
