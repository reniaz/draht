/**
 * Local Font Access API — not yet in TypeScript's DOM lib.
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/queryLocalFonts
 */
type LocalFontData = {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
};

declare function queryLocalFonts(): Promise<LocalFontData[]>;
