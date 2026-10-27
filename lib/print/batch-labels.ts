/** Shared by the server (batch selection) and the batch form: a short name for the bar, and what it means. */
export const BATCH_WHICH_LABELS = {
  not_printed: { short: "New only", long: "Only campers who never got this one." },
  changed: { short: "New + changed", long: "New campers, and anyone whose details on this label changed since it was printed: a moved bunk, a corrected name, a new phone number. Changes to details that aren't on this label don't count, nor does moving things around on the template. Labels printed before this option existed count as unchanged." },
  all: { short: "Everyone", long: "Everyone, printed before or not." },
  present: { short: "Here now", long: "Only campers checked in right now." },
  arrived_today: { short: "Arrived today", long: "Only campers who arrived today." },
} as const;
export type BatchWhichKey = keyof typeof BATCH_WHICH_LABELS;
