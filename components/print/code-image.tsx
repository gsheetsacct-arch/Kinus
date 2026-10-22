"use client";
import * as React from "react";
import { codePreviews } from "@/app/(app)/print/actions";
import { tintCode } from "@/lib/print/code-color";

type Code = { svg: string; modules: number };
const cache = new Map<string, Code>();
const waiting = new Map<string, Promise<Code>>();

function load(type: "barcode" | "qr", text: string): Promise<Code> {
  const key = `${type}|${text}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  let p = waiting.get(key);
  if (!p) {
    p = codePreviews([{ type, text }])
      .then(([c]) => {
        cache.set(key, c);
        return c;
      })
      .finally(() => waiting.delete(key));
    waiting.set(key, p);
  }
  return p;
}

/** The real code (made on the server by the same code that prints), for the editor. */
export function useCode(type: "barcode" | "qr", text: string): Code | null {
  const key = `${type}|${text}`;
  const [code, setCode] = React.useState<Code | null>(() => cache.get(key) ?? null);
  React.useEffect(() => {
    if (!text) return setCode(null);
    let live = true;
    const t = setTimeout(() => load(type, text).then((c) => live && setCode(c)).catch(() => undefined), cache.has(key) ? 0 : 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [type, text, key]);
  return code;
}

export function CodeImage({ svg, stretch, color }: { svg: string; stretch?: boolean; color?: string }) {
  const html = tintCode(svg, color).replace("<svg ", `<svg preserveAspectRatio="${stretch ? "none" : "xMidYMid meet"}" style="width:100%;height:100%;display:block" `);
  return <div className="size-full" dangerouslySetInnerHTML={{ __html: html }} />;
}
