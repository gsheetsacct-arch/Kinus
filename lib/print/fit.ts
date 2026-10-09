/**
 * Shrink-to-fit for the editor's canvas: the same rule the printed page uses (start at
 * the target size, jump to roughly the right size, then step down; never below min).
 * Returns the size used, and whether the text still doesn't fit at the minimum.
 */
export function fitText(box: HTMLElement, text: HTMLElement, targetPx: number, minPx: number): { px: number; overflow: boolean } {
  const over = () => text.scrollWidth > box.clientWidth + 0.5 || box.scrollHeight > box.clientHeight + 0.5;
  let s = targetPx;
  box.style.fontSize = `${s}px`;
  if (!over()) return { px: s, overflow: false };
  const r = Math.min(box.clientWidth / Math.max(text.scrollWidth, 1), box.clientHeight / Math.max(box.scrollHeight, 1));
  s = Math.max(minPx, Math.floor(s * Math.min(1, r) * 4) / 4);
  box.style.fontSize = `${s}px`;
  for (let guard = 0; guard < 200 && s > minPx && over(); guard++) {
    s = Math.max(minPx, s - 0.25);
    box.style.fontSize = `${s}px`;
  }
  return { px: s, overflow: over() };
}
