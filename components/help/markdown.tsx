import * as React from "react";

/**
 * The guide's Markdown, as the Help page shows it: headings (## / ###), paragraphs, lists
 * (- and 1.), tables (| a | b |), notes (> …), **bold** and `code`. Only that: the guide is our own text.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.trim().split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(<h3 key={i} className="mt-5 mb-2 text-base font-semibold">{inline(line.slice(4))}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(<h2 key={i} className="mt-6 mb-2 text-lg font-semibold">{inline(line.slice(3))}</h2>);
      i++;
      continue;
    }
    if (line.startsWith("> ")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) quote.push(lines[i++].slice(2));
      out.push(<div key={i} className="my-3 rounded-lg border border-primary/30 bg-primary-soft/40 px-3 py-2 text-sm leading-relaxed">{inline(quote.join(" "))}</div>);
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={i} className="my-3 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr>{head.map((c, j) => <th key={j} className="border-b px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground">{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k} className="align-top">
                  {r.map((c, j) => <td key={j} className="border-b border-dashed px-2 py-1.5">{inline(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]) : lines[i].startsWith("- "))) {
        items.push(lines[i].replace(/^(- |\d+\. )/, ""));
        i++;
      }
      const L = ordered ? "ol" : "ul";
      out.push(
        <L key={i} className={`my-2 space-y-1 pl-5 text-sm ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((t, k) => <li key={k}>{inline(t)}</li>)}
        </L>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3} |\||- |\d+\. |> )/.test(lines[i])) para.push(lines[i++]);
    out.push(<p key={i} className="my-2 text-sm leading-relaxed">{inline(para.join(" "))}</p>);
  }
  return <>{out}</>;
}

/** **bold** and `code` within a line. */
function inline(t: string): React.ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, k) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={k}>{part.slice(2, -2)}</strong>
    ) : part.startsWith("`") && part.endsWith("`") ? (
      <code key={k} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{part.slice(1, -1)}</code>
    ) : (
      part
    ),
  );
}
