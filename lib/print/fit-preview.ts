/**
 * Shrinks a tag preview to fit its frame on screen. Only the screen: printing from the
 * frame still prints at real size.
 */
export function fitPreview(frame: HTMLIFrameElement | null) {
  const doc = frame?.contentDocument;
  if (!frame || !doc?.body) return;
  const first = doc.querySelector<HTMLElement>(".sheet, .tag");
  if (!first) return;
  const pad = 64; // the preview's own padding, both sides
  const scale = Math.min(1, (frame.clientWidth - 8) / (first.offsetWidth + pad));
  let style = doc.getElementById("kinus-fit") as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = "kinus-fit";
    doc.head.appendChild(style);
  }
  style.textContent = scale < 1 ? `@media screen { body { zoom: ${scale.toFixed(3)}; } }` : "";
}
