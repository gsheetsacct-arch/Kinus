import Link from "next/link";
import { formatPhone, formatWhen, telHref } from "@/lib/utils";

export type Reply = {
  id: string;
  name: string | null;
  phone_e164: string;
  body: string;
  received_at: string;
  /** Their division(s), for the inbox. */
  where?: string;
  /** The inbox: the text it probably answers (null: none from the week before). */
  answering?: { id: string; body: string; sender: string } | null;
};

/** Texts people sent back to the camp number: who, when, and what they said (tap the number to call back). */
export function ReplyList({ replies }: { replies: Reply[] }) {
  return (
    <ul className="divide-y">
      {replies.map((r) => (
        <li key={r.id} className="space-y-0.5 px-5 py-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground" dir="auto">
              {r.name ?? "Unknown number"}
            </span>{" "}
            ·{" "}
            <a href={telHref(r.phone_e164)} className="hover:underline">
              {formatPhone(r.phone_e164)}
            </a>{" "}
            {r.where && <> · <span dir="auto">{r.where}</span></>} · {formatWhen(r.received_at)}
          </p>
          <p className="whitespace-pre-wrap text-sm" dir="auto">
            {r.body}
          </p>
          {r.answering !== undefined && (
            <p className="truncate text-xs text-muted-foreground" dir="auto">
              {r.answering ? (
                <>
                  Probably answering{" "}
                  <Link href={`/messages/${r.answering.id}`} className="text-primary hover:underline">
                    “{r.answering.body}”
                  </Link>{" "}
                  from {r.answering.sender}
                </>
              ) : (
                "Not answering any text from the week before"
              )}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
