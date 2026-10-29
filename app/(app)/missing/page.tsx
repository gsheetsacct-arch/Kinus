import { redirect } from "next/navigation";

/** "Not here yet" is part of Who's here now: its campers not here yet. */
export default function MissingPage() {
  redirect("/status?status=expected");
}
