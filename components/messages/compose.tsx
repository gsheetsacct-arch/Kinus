"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { SIGN_CHOICES, cleanSign, defaultSign, pickRecipients, smsSegments, textPrefix, type TextRecipient } from "@/lib/sms";
import { cn } from "@/lib/utils";
import { sendText } from "@/app/(app)/messages/actions";

export type ComposeCamp = { id: string; name: string; divisions: { id: string; name: string; color: string | null }[] };

/** Write a text, pick who gets it (everyone, or divisions; every role or only some), see exactly who that is, send. */
export function Compose({
  camps,
  recipients,
  roles,
  canEveryone,
  configured,
  role,
}: {
  camps: ComposeCamp[];
  recipients: TextRecipient[];
  roles: { value: string; label: string }[];
  canEveryone: boolean;
  configured: boolean;
  role: string;
}) {
  const router = useRouter();
  const all = camps.flatMap((c) => c.divisions);
  const [mode, setMode] = React.useState<"everyone" | "divisions">(canEveryone ? "everyone" : "divisions");
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set(all.length === 1 ? [all[0].id] : []));
  const [someRoles, setSomeRoles] = React.useState(false);
  const [pickedRoles, setPickedRoles] = React.useState<Set<string>>(() => new Set());
  const [body, setBody] = React.useState("");
  const [showWho, setShowWho] = React.useState(false);
  const [pending, start] = React.useTransition();

  const divisionIds = mode === "everyone" ? null : [...picked];
  const roleIds = someRoles ? [...pickedRoles] : null;
  const { to, skipped } = React.useMemo(() => pickRecipients(recipients, divisionIds, roleIds), [recipients, mode, picked, someRoles, pickedRoles]); // eslint-disable-line react-hooks/exhaustive-deps
  // how many of each role are in the divisions picked (before narrowing by role)
  const perRole = React.useMemo(() => {
    const n = new Map<string, number>();
    for (const r of pickRecipients(recipients, divisionIds).to) if (r.role) n.set(r.role, (n.get(r.role) ?? 0) + 1);
    return n;
  }, [recipients, mode, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Send as": the sign in front (their role's by default; remembered on this device)
  const [signAs, setSignAs] = React.useState<string>(() => defaultSign(role));
  const [custom, setCustom] = React.useState(false);
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("kinus:text-sign");
      if (saved !== null) {
        setSignAs(saved);
        setCustom(!(SIGN_CHOICES as readonly string[]).includes(saved));
      }
    } catch {}
  }, []);
  const chooseSign = (v: string) => {
    setSignAs(v);
    try {
      localStorage.setItem("kinus:text-sign", v);
    } catch {}
  };
  const prefix = textPrefix(role, cleanSign(signAs));
  // counted as it goes out: with the camp and role in front
  const seg = smsSegments(body.trim() ? prefix + body.trim() : "");
  const nothingPicked = (mode === "divisions" && picked.size === 0) || (someRoles && pickedRoles.size === 0);
  const toggle = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const next = new Set(p);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const send = () => {
    if (!confirm(`Text ${to.length} ${to.length === 1 ? "person" : "people"} now? This can't be taken back.`)) return;
    start(async () => {
      const r = await sendText({ body, divisionIds, roles: roleIds, signAs: cleanSign(signAs) });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message);
      setBody("");
      if (r.redirect) router.push(r.redirect);
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-medium">Send to</p>
        {canEveryone && (
          <Segmented
            value={mode}
            onChange={(v) => setMode(v as "everyone" | "divisions")}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: "divisions", label: "Pick divisions" },
            ]}
          />
        )}
        {mode === "everyone" ? (
          <p className="text-sm text-muted-foreground">All staff with a phone number, directors and office included, and everyone who signed up for updates.</p>
        ) : (
          <div className="space-y-3">
            {camps.map((camp) => {
              const ids = camp.divisions.map((d) => d.id);
              const allOn = ids.every((id) => picked.has(id));
              return (
                <div key={camp.id} className="space-y-2">
                  {camps.length > 1 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{camp.name}</span>
                      {ids.length > 1 && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => toggle(ids, !allOn)}>
                          {allOn ? "Clear" : `All of ${camp.name}`}
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {camp.divisions.map((d) => (
                      <label key={d.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", picked.has(d.id) && "border-primary bg-primary-soft/50")}>
                        <Checkbox checked={picked.has(d.id)} onCheckedChange={(v) => toggle([d.id], v === true)} />
                        {d.color && <span className="size-2.5 rounded-full" style={{ background: d.color }} />}
                        <span dir="auto">{d.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {!all.length && <p className="text-sm text-muted-foreground">You don&apos;t have any divisions in this session yet.</p>}
          </div>
        )}
      </div>

      {roles.length > 1 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Which staff</p>
          <Segmented
            value={someRoles ? "some" : "all"}
            onChange={(v) => setSomeRoles(v === "some")}
            options={[
              { value: "all", label: "Every role" },
              { value: "some", label: "Only some roles" },
            ]}
          />
          {someRoles && (
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <label key={r.value} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm", pickedRoles.has(r.value) && "border-primary bg-primary-soft/50")}>
                  <Checkbox
                    checked={pickedRoles.has(r.value)}
                    onCheckedChange={(v) =>
                      setPickedRoles((p) => {
                        const next = new Set(p);
                        if (v === true) next.add(r.value);
                        else next.delete(r.value);
                        return next;
                      })
                    }
                  />
                  {r.label}
                  <span className="text-xs text-muted-foreground">{perRole.get(r.value) ?? 0}</span>
                </label>
              ))}
            </div>
          )}
          {someRoles && mode === "everyone" && <p className="text-xs text-muted-foreground">People who only signed up for updates have no role, so they don&apos;t get it.</p>}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Send as</p>
        <div className="flex flex-wrap gap-2">
          {SIGN_CHOICES.map((s) => (
            <button
              key={s || "none"}
              type="button"
              onClick={() => {
                setCustom(false);
                chooseSign(s);
              }}
              className={cn("rounded-full border px-3 py-1.5 text-sm", !custom && signAs === s ? "border-primary bg-primary-soft/50 font-medium" : "text-muted-foreground")}
            >
              {s || "Just the camp"}
              {s && s === defaultSign(role) && <span className="ml-1 text-xs text-muted-foreground">(your role)</span>}
            </button>
          ))}
          <button type="button" onClick={() => setCustom(true)} className={cn("rounded-full border px-3 py-1.5 text-sm", custom ? "border-primary bg-primary-soft/50 font-medium" : "text-muted-foreground")}>
            Other…
          </button>
        </div>
        {custom && <Input value={signAs} onChange={(e) => chooseSign(e.target.value)} maxLength={30} placeholder="A name or title, e.g. Mendel or Kitchen" className="max-w-xs" dir="auto" />}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="text-body" className="text-sm font-medium">
          Message
        </label>
        <Textarea id="text-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={1600 - prefix.length} dir="auto" placeholder="Staff meeting tonight at 9:30 in the dining room." />
        <p className="text-xs text-muted-foreground">
          Starts with “{prefix.trim()}” · {seg.length} characters
          {seg.segments > 1 && ` · sent as ${seg.segments} texts each`}
          {seg.unicode && seg.length > 0 && " · Hebrew, emoji and other special characters fit 70 to a text instead of 160"}
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        {nothingPicked ? (
          <p className="text-muted-foreground">{mode === "divisions" && picked.size === 0 ? "Pick the divisions to text." : "Pick the roles to text."}</p>
        ) : (
          <>
            <p>
              Goes to <strong>{to.length}</strong> {to.length === 1 ? "person" : "people"}
              {skipped.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {skipped.filter((s) => s.why === "no phone").length > 0 && `${skipped.filter((s) => s.why === "no phone").length} without a phone number`}
                  {skipped.some((s) => s.why === "no phone") && skipped.some((s) => s.why === "opted out") && ", "}
                  {skipped.filter((s) => s.why === "opted out").length > 0 && `${skipped.filter((s) => s.why === "opted out").length} replied STOP`}
                </span>
              )}{" "}
              {(to.length > 0 || skipped.length > 0) && (
                <button type="button" className="text-primary hover:underline" onClick={() => setShowWho((v) => !v)}>
                  {showWho ? "Hide" : "Show who"}
                </button>
              )}
            </p>
            {showWho && (
              <ul className="mt-2 max-h-64 space-y-0.5 overflow-auto text-sm">
                {to.map((r) => (
                  <li key={r.key} dir="auto">
                    {r.name}
                    {r.signup && <span className="text-muted-foreground"> (signed up)</span>}
                  </li>
                ))}
                {skipped.map((r) => (
                  <li key={r.key} className="text-muted-foreground" dir="auto">
                    {r.name}: {r.why === "no phone" ? "no phone number" : "replied STOP"}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <Button type="button" size="lg" onClick={send} disabled={!configured || pending || nothingPicked || !body.trim() || !to.length} className="w-full sm:w-auto">
        <Send /> {pending ? "Sending…" : to.length ? `Text ${to.length} ${to.length === 1 ? "person" : "people"}` : "Send"}
      </Button>
    </div>
  );
}
