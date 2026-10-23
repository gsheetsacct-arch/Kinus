/**
 * Shrink-to-fit for the editor's canvas: the same rule the printed page uses (start at
 * the target size, jump to roughly the right size, then step down to the smallest size).
 * Text that still doesn't fit keeps going, down to the floor, rather than be cut off:
 * `below` says it went under the smallest size, `overflow` that it doesn't fit even at the floor.
 */
export function fitText(box: HTMLElement, text: HTMLElement, targetPx: number, minPx: number, floorPx = minPx): { px: number; overflow: boolean; below: boolean } {
  const over = () => text.scrollWidth > box.clientWidth + 0.5 || box.scrollHeight > box.clientHeight + 0.5;
  let s = targetPx;
  box.style.fontSize = `${s}px`;
  if (!over()) return { px: s, overflow: false, below: false };
  // text on more lines steps down from its size: a jump would skip the sizes where it fits on fewer lines
  const r = getComputedStyle(box).whiteSpace === "nowrap" ? Math.min(box.clientWidth / Math.max(text.scrollWidth, 1), box.clientHeight / Math.max(box.scrollHeight, 1)) : 1;
  // the same steps as the printed page (half a pixel), so the editor's size is the printed size
  s = Math.max(minPx, Math.floor(s * Math.min(1, r) * 2) / 2);
  box.style.fontSize = `${s}px`;
  for (let guard = 0; guard < 200 && s > minPx && over(); guard++) {
    s = Math.max(minPx, s - 0.5);
    box.style.fontSize = `${s}px`;
  }
  // past the smallest size: only as far as needed to show it all
  for (let guard = 0; guard < 400 && s > floorPx && over(); guard++) {
    s = Math.max(floorPx, s - 0.5);
    box.style.fontSize = `${s}px`;
  }
  return { px: s, overflow: over(), below: s < minPx };
}
