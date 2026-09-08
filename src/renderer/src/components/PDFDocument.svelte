<script lang="ts">
  import { getHMSStringFromSeconds } from '../lib/utils'
  import {
    Store,
    Hourglass,
    CalendarDays,
    Folder,
    SquareCheckBig,
  } from '@lucide/svelte'

  export let pdfDocument: PDFQueryResult[]
</script>

<div class="space-y-2">
  <!-- Tasks List -->
  {#each pdfDocument as item (item.id)}
    <div class="shadow-xl border rounded-lg">
      <div class="p-4">
        <div
          class="font-semibold text-xs grid grid-cols-[max-content_1fr] content-start gap-2 w-fit p-1"
        >
          <span class="w-fit">
            <Store size="16" class="text-info" />
          </span>
          <span class="w-fit">{item.companyName}</span>
        </div>
        <div
          class="text-xl grid grid-cols-[max-content_1fr] content-start gap-2 w-fit p-1"
        >
          <span>
            <Folder size="24" class="text-success" />
          </span>
          <span>{item.projectName}</span>
        </div>
        <div
          class="font-semibold text-base grid grid-cols-[max-content_1fr] content-start gap-2 w-fit p-1"
        >
          <div class="w-fit">
            <SquareCheckBig size="24" class="text-warning" />
          </div>
          <div class="w-fit">{item.name}</div>
        </div>
        {#if item.description}
          <div class="prose max-w-none markdown-content text-sm p-1">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html item.description}
          </div>
        {/if}
        <div class="flex gap-4 mt-2 text-sm p-1">
          <div class="flex items-center gap-2">
            <CalendarDays size="16" class="text-info" />
            <time datetime={item.date}>{item.date}</time>
          </div>
          <div class="flex items-center gap-2">
            <Hourglass size="16" class="text-secondary" />
            <span>Time spent: {getHMSStringFromSeconds(item.seconds)}</span>
          </div>
        </div>
      </div>
    </div>
  {/each}

  <!-- Stats View -->

  <div role="alert" class="alert">
    <CalendarDays size="16" class="text-info" />
    <span>
      The tasks shown are between <strong>{pdfDocument[0]?.date}</strong> and
      <strong>{pdfDocument[pdfDocument.length - 1]?.date}</strong>
    </span>
  </div>
  <div role="alert" class="alert">
    <Hourglass size="16" class="text-secondary" />
    <span>
      All tasks combined have a total time of
      <strong>
        {getHMSStringFromSeconds(
          pdfDocument.reduce((acc, item) => acc + item.seconds, 0),
        )}
      </strong>
    </span>
  </div>

  <!-- Powered by header -->
  <section class="hero rounded-lg p-4">
    <div class="hero-content text-center">
      <div>
        <h1 class="font-bold text-sm">
          Generated with ♥️ <a href="https://timetrack.gaia.ws">timetrack</a>
        </h1>
      </div>
    </div>
  </section>
</div>
