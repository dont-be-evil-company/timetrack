<script lang="ts">
  import { pdfExportData, pdfExportShowing } from '../stores'
  import PDFDocument from './PDFDocument.svelte'

  let pdfData: PDFQueryResult[] | null = null
  let showingPDF = false

  // Subscribe to shared PDF export data (from Search component)
  pdfExportData.subscribe(value => {
    if (value !== null) {
      pdfData = value
    }
  })

  pdfExportShowing.subscribe(value => {
    showingPDF = value
  })
</script>

{#if showingPDF && pdfData && pdfData.length > 0}
  <PDFDocument pdfDocument={pdfData} />
{:else if showingPDF && pdfData && pdfData.length === 0}
  <div class="alert alert-warning">
    <span>No tasks found for the selected criteria.</span>
  </div>
{/if}
