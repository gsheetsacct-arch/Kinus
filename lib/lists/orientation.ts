/** A list layout's printed page: "auto" (sideways when more than 10 columns), "portrait" or "landscape". */
export type ListOrientation = "auto" | "portrait" | "landscape";
export const parseOrientation = (v: unknown): ListOrientation => (v === "portrait" || v === "landscape" ? v : "auto");
/** Whether a list prints sideways: as the layout says, else when it has more than 10 columns. */
export const printsLandscape = (orientation: ListOrientation | undefined, columns: number) => (orientation === "landscape" ? true : orientation === "portrait" ? false : columns > 10);
