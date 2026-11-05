/** A list layout's printed page: landscape (sideways, the default) or portrait (upright). */
export type ListOrientation = "portrait" | "landscape";
/** Landscape unless the layout says portrait (older layouts, and "automatic", print landscape too). */
export const parseOrientation = (v: unknown): ListOrientation => (v === "portrait" ? "portrait" : "landscape");
/** Whether a list prints sideways: every list does, unless its layout says portrait. */
export const printsLandscape = (orientation: ListOrientation | undefined) => orientation !== "portrait";
