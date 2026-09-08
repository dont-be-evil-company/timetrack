<script lang="ts">
  import { getHMSToSeconds, getHMSFromSeconds } from '../lib/utils'

  export let task: DBTask | ActiveTask
  export let hours: number | undefined = undefined
  export let minutes: number | undefined = undefined
  export let seconds: number | undefined = undefined
  export let disabled: boolean = false
  export let showAddUp: boolean = false

  let addUpHours = 0
  let addUpMinutes = 0
  let addUpSeconds = 0
  let showAddUpSection = false

  $: isActive = 'isActive' in task && task.isActive
  $: hms = getHMSFromSeconds(task.seconds)

  // Initialize from task if bindings not provided
  let currentHours = hours !== undefined ? hours : hms.hours
  let currentMinutes = minutes !== undefined ? minutes : hms.minutes
  let currentSeconds = seconds !== undefined ? seconds : hms.seconds

  // Sync with bindings if provided (props are read-only, so we sync local state)
  $: {
    if (hours !== undefined) {
      currentHours = hours
    } else {
      currentHours = hms.hours
    }
    if (minutes !== undefined) {
      currentMinutes = minutes
    } else {
      currentMinutes = hms.minutes
    }
    if (seconds !== undefined) {
      currentSeconds = seconds
    } else {
      currentSeconds = hms.seconds
    }
  }

  $: totalSeconds = getHMSToSeconds(
    currentHours,
    currentMinutes,
    currentSeconds,
  )

  function handleChange() {
    // Values updated via bindings
  }

  function handleAddUp() {
    const total = getHMSToSeconds(
      currentHours + addUpHours,
      currentMinutes + addUpMinutes,
      currentSeconds + addUpSeconds,
    )
    const newHms = getHMSFromSeconds(total)
    currentHours = newHms.hours
    currentMinutes = newHms.minutes
    currentSeconds = newHms.seconds
  }
</script>

<input type="hidden" name="seconds" value={totalSeconds} />

<div class="grid grid-cols-3 gap-4">
  <div class="form-control">
    <label class="label" for="task-hours">
      <span class="label-text">Hours</span>
    </label>
    <input
      id="task-hours"
      type="number"
      bind:value={currentHours}
      min="0"
      class="input input-bordered"
      disabled={disabled || isActive}
      on:input={handleChange}
    />
  </div>
  <div class="form-control">
    <label class="label" for="task-minutes">
      <span class="label-text">Minutes</span>
    </label>
    <input
      id="task-minutes"
      type="number"
      bind:value={currentMinutes}
      min="0"
      max="59"
      class="input input-bordered"
      disabled={disabled || isActive}
      on:input={handleChange}
    />
  </div>
  <div class="form-control">
    <label class="label" for="task-seconds">
      <span class="label-text">Seconds</span>
    </label>
    <input
      id="task-seconds"
      type="number"
      bind:value={currentSeconds}
      min="0"
      max="59"
      class="input input-bordered"
      disabled={disabled || isActive}
      on:input={handleChange}
    />
  </div>
</div>

{#if showAddUp && !isActive}
  <div class="mt-4">
    <button
      type="button"
      class="btn btn-sm"
      on:click={() => (showAddUpSection = !showAddUpSection)}
    >
      <span>Add up time to the current task...</span>
      <i class="fa-solid fa-angle-down"></i>
    </button>

    {#if showAddUpSection}
      <div class="alert alert-info mt-2">
        <i class="fa-solid fa-info-circle"></i>
        <div>
          <strong>Add Up Time</strong>
          <p>Use this to add time to the current task.</p>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-4 mt-2">
        <div class="form-control">
          <label class="label" for="add-hours">
            <span class="label-text">Add Hours</span>
          </label>
          <input
            id="add-hours"
            type="number"
            bind:value={addUpHours}
            min="0"
            class="input input-bordered"
          />
        </div>
        <div class="form-control">
          <label class="label" for="add-minutes">
            <span class="label-text">Add Minutes</span>
          </label>
          <input
            id="add-minutes"
            type="number"
            bind:value={addUpMinutes}
            min="0"
            max="59"
            class="input input-bordered"
          />
        </div>
        <div class="form-control">
          <label class="label" for="add-seconds">
            <span class="label-text">Add Seconds</span>
          </label>
          <input
            id="add-seconds"
            type="number"
            bind:value={addUpSeconds}
            min="0"
            max="59"
            class="input input-bordered"
          />
        </div>
      </div>
      <button
        type="button"
        class="btn btn-secondary mt-2"
        on:click={handleAddUp}
      >
        Add Up
      </button>
    {/if}
  </div>
{/if}
