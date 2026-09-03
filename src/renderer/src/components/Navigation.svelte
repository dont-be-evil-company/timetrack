<script lang="ts">
  import { House, Search, Bug, Code } from '@lucide/svelte'
  import { selectedPanel } from '../stores'

  export let currentPanel: string = 'Overview'
  export let onPanelChange: ((panel: string) => void) | undefined = undefined

  function handlePanelClick(panel: string) {
    selectedPanel.set(panel)
    if (onPanelChange) {
      onPanelChange(panel)
    }
  }

  function handleTopButtonClick(action: string) {
    switch (action) {
      case 'reportABug':
        window.open('https://github.com/dont-be-evil-company/timetrack/issues/new')
        break
      case 'seeTheCode':
        window.open('https://github.com/dont-be-evil-company/timetrack')
        break
    }
  }
</script>

<div class="flex justify-between p-4">
  <ul class="flex space-x-2">
    <li>
      <div class="tooltip tooltip-bottom" data-tip="Home">
        <button
          class="btn {currentPanel === 'Overview'
            ? 'btn-outline btn-accent'
            : ''}"
          onclick={() => handlePanelClick('Overview')}
          ><House size="16" /></button
        >
      </div>
    </li>
    <li>
      <div class="tooltip tooltip-bottom" data-tip="Search">
        <button
          class="btn {currentPanel === 'Search'
            ? 'btn-outline btn-accent'
            : ''}"
          onclick={() => handlePanelClick('Search')}
          ><Search size="16" /></button
        >
      </div>
    </li>
  </ul>
  <ul class="flex space-x-2">
    <li>
      <div class="tooltip tooltip-bottom" data-tip="Report a Bug">
        <button class="btn"><Bug size="16" /></button>
      </div>
    </li>
    <li>
      <div class="tooltip tooltip-left" data-tip="See the Code">
        <button class="btn" onclick={() => handleTopButtonClick('seeTheCode')}
          ><Code size="16" /></button
        >
      </div>
    </li>
  </ul>
</div>
