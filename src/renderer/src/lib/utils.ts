export const getHMSFromSeconds = (s: number) => {
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  return { hours, minutes, seconds }
}

export const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms))

export const getHMSToSeconds = (
  hours: number,
  minutes: number,
  seconds: number,
) => {
  return hours * 3600 + minutes * 60 + seconds
}

export const getHMSStringFromSeconds = (s: number) => {
  const { hours, minutes, seconds } = getHMSFromSeconds(s)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Insert HTML <br/> for blank lines so they render visually, while leaving
 * fenced code blocks (``` / ~~~) untouched so the tag is not shown as text.
 */
export const prepareMarkdownWithBlankLineBreaks = (
  markdown: string,
): string => {
  const fenceRe = /```[^\n]*\n[\s\S]*?```|~~~[^\n]*\n[\s\S]*?~~~/g
  const parts: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = fenceRe.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        markdown
          .slice(lastIndex, match.index)
          .replace(/\n(?=\n)/g, '\n\n<br/>\n'),
      )
    }
    parts.push(match[0])
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < markdown.length) {
    parts.push(markdown.slice(lastIndex).replace(/\n(?=\n)/g, '\n\n<br/>\n'))
  }

  return parts.join('')
}
