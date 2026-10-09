/** Shared by the server (batch selection) and the batch form. */
export const BATCH_WHICH_LABELS = {
  not_printed: "Only campers who never got this one",
  all: "Everyone",
  present: "Only campers here right now",
  arrived_today: "Only campers who arrived today",
} as const;
export type BatchWhichKey = keyof typeof BATCH_WHICH_LABELS;
