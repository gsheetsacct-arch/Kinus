/**
 * Roughly how wide a text prints (in "average letters"): enough to tell which of two names
 * needs more room. Capitals, M and W are wide; i, l, t and spaces narrow.
 */
export function widthEstimate(s: string): number {
  let w = 0;
  for (const ch of s) {
    if (/[MWmw@%]/.test(ch)) w += 0.85;
    else if (/[A-Z]/.test(ch)) w += 0.68;
    else if (/[ilIjtfr.,:;'’|!\s]/.test(ch)) w += 0.32;
    else if (/[֐-׿]/.test(ch)) w += 0.6;
    else w += 0.55;
  }
  return Math.round(w * 10) / 10;
}
