/**
 * A field a list layout can use: one of Kinus' own (own), or an export column
 * ("source.<column>", any name, spaces too: "source.Bus Number"; not { } | or line breaks).
 */
export const isListKey = (k: string, own: (k: string) => boolean): boolean => own(k) || (k.length <= 210 && /^source\.[^{}|\r\n]*[^{}|\s][^{}|\r\n]*$/.test(k));
