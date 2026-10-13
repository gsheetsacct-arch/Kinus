/** CSS pixels per point. */
export const PX_PER_PT = 96 / 72;
/** How small text may shrink when a text part doesn't say. */
export const DEFAULT_MIN_PT = 6;

/** The smallest a text part may shrink to: its own minimum (6 pt if none), never above its size. */
export const minPt = (l: { size: number; minSize?: number }) => Math.min(l.minSize ?? DEFAULT_MIN_PT, l.size);

/**
 * A name that doesn't fit even at its part's smallest size (a longer one added after the
 * template was made) keeps shrinking, down to this, so it prints whole rather than cut off;
 * Kinus tells the office which ones did. Only past this is text cut.
 */
export const FLOOR_PT = 4;
