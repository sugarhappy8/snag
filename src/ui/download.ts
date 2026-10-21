// Saving text to the player's device: the name a copy gets, and the download itself.

/** True when `text` parses as JSON. A compressed record (gz1 or gz2) and a damaged one do not. */
function isJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/** `anotherlife-save-YYYY-MM-DD.json` (UTC day), or `.txt` when `text` is not JSON. */
export function saveCopyFilename(now: Date, text: string): string {
  return `anotherlife-save-${now.toISOString().slice(0, 10)}.${isJson(text) ? 'json' : 'txt'}`
}

/** Hands `text` to the browser as a file named `filename`: a Blob behind a temporary link that is clicked once. */
export function downloadText(filename: string, text: string): void {
  const type = filename.endsWith('.json') ? 'application/json' : 'text/plain'
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Some browsers start reading the URL after the click returns: let it go a moment later.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
