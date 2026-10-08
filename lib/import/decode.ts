import iconv from "iconv-lite";

export type Decoded = { text: string; encoding: string };

/**
 * Decodes a text file as UTF-8/UTF-16 when it is one, otherwise picks between
 * Windows-1255 (Hebrew ANSI) and Windows-1252 (Western ANSI) by looking at how the
 * high bytes cluster: Hebrew words are runs of high bytes, French has isolated
 * accented letters between ASCII ones.
 */
export function decodeText(input: Uint8Array): Decoded {
  const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString("utf8"), encoding: "utf-8-bom" };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: iconv.decode(buf.subarray(2), "utf16-le"), encoding: "utf-16le" };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: iconv.decode(buf.subarray(2), "utf16-be"), encoding: "utf-16be" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), encoding: "utf-8" };
  } catch {
    // not valid UTF-8: legacy single-byte encoding
  }
  let high = 0;
  let clustered = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] >= 0x80) {
      high++;
      if ((i > 0 && buf[i - 1] >= 0x80) || (i + 1 < buf.length && buf[i + 1] >= 0x80)) clustered++;
    }
  }
  const hebrew = high > 0 && clustered / high >= 0.5;
  const encoding = hebrew ? "windows-1255" : "windows-1252";
  return { text: iconv.decode(buf, hebrew ? "win1255" : "win1252"), encoding };
}
