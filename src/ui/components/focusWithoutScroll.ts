/**
 * A ref callback that focuses its element without scrolling to it. React's autoFocus calls focus() with no options, so
 * a card taller than the screen would open scrolled down to the button. The function is one stable reference, so React
 * calls it when the button mounts and not again on a re-render, which would pull focus back from wherever it went.
 * It lives in its own file so the digest card and the year card share it without importing each other.
 */
export function focusWithoutScroll(el: HTMLElement | null): void {
  el?.focus({ preventScroll: true })
}
