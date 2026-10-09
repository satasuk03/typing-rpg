/** Glyph-cell layout and word wrapping for plate text (pure). */

export interface GlyphCell {
  /** Index into the plate's text. */
  index: number;
  line: number;
  col: number;
  isSpace: boolean;
}

export interface TextLayout {
  cells: GlyphCell[];
  lineCount: number;
  /** Widest line in cells. */
  cols: number;
}

/**
 * Greedy word wrap into lines of at most `maxCols` cells. Every character index of `text` gets a
 * cell (a space that ends a line is parked at the end of that line so indices stay contiguous).
 */
export function layoutText(text: string, maxCols: number): TextLayout {
  const cells: GlyphCell[] = [];
  let line = 0;
  let col = 0;
  let cols = 1;
  let i = 0;
  const n = text.length;
  while (i < n) {
    if (text[i] === " ") {
      cells.push({ index: i, line, col, isSpace: true });
      col++;
      i++;
      continue;
    }
    let j = i;
    while (j < n && text[j] !== " ") j++;
    const wlen = j - i;
    if (col > 0 && col + wlen > maxCols) {
      // wrap: the space just pushed stays at the end of the previous line
      line++;
      col = 0;
    }
    for (let k = i; k < j; k++) {
      cells.push({ index: k, line, col, isSpace: false });
      col++;
    }
    i = j;
  }
  cols = 1;
  for (const c of cells) if (!c.isSpace) cols = Math.max(cols, c.col + 1);
  return { cells, lineCount: line + 1, cols };
}
