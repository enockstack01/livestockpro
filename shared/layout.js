/* Responsive card grid rules shared by the web dashboard (CSS grid) and the
   mobile app (flex-wrap), so both pack chart cards the same way.

   Like CropManager's chart grid, cards sit side by side; here even phones
   get at least two per row:
     < 1000px wide  → 2 columns
     1000–1499px    → 3 columns
     ≥ 1500px       → 4 columns
   A card can be:
     wide: true    — a dense time series (12 months of grouped or stacked
                     bars) that keeps two columns
     wide: 'soft'  — a time series that reads fine at half width (a line,
                     single bars), given two columns only when that leaves
                     no card alone
     wide: false   — an ordinary card, one column
   Packing is "dense": when a wide card doesn't fit the rest of a row, the
   next ordinary card fills it first. A card that would still end up alone
   on a row makes a soft wide card (and, on screens ≥ 600px, any wide card)
   give up its second column; as a last resort the lone card stretches so
   rows always run edge to edge. */

export function gridColumns(width) {
  if (width >= 1500) return 4;
  if (width >= 1000) return 3;
  return 2;
}

function pack(wides, cols) {
  const queue = wides.map((wide, i) => ({ i, span: wide ? Math.min(2, cols) : 1 }));
  const order = [];
  const spans = new Array(wides.length).fill(1);
  const alone = [];
  let used = 0;
  let row = [];
  const closeRow = () => {
    if (row.length && used < cols) {
      const last = row[row.length - 1];
      spans[last] += cols - used;
      if (row.length === 1 && !wides[last]) alone.push(last);
    }
    used = 0;
    row = [];
  };
  while (queue.length) {
    let k = queue.findIndex((q) => used + q.span <= cols);
    if (k < 0) { closeRow(); k = 0; }
    const [q] = queue.splice(k, 1);
    order.push(q.i);
    spans[q.i] = q.span;
    row.push(q.i);
    used += q.span;
    if (used === cols) { used = 0; row = []; }
  }
  closeRow();
  return { order, spans, alone };
}

/* items: [{ wide }]; width: the grid's width in px.
   Returns the column count, each item's span, and the display order
   (positions, by item index). */
export function layoutCards(items, width) {
  const cols = gridColumns(width);
  const kind = items.map((it) => (it.wide === 'soft' ? 'soft' : it.wide ? 'hard' : 'none'));
  const wides = kind.map((k) => k !== 'none');
  let result = pack(wides, cols);
  const tryNarrow = (which) => {
    for (let i = wides.length - 1; i >= 0 && result.alone.length > 0; i--) {
      if (!wides[i] || kind[i] !== which) continue;
      wides[i] = false;
      result = pack(wides, cols);
    }
  };
  tryNarrow('soft');
  if (width >= 600) tryNarrow('hard');
  const position = new Array(items.length);
  result.order.forEach((itemIndex, pos) => { position[itemIndex] = pos; });
  return { cols, spans: result.spans, position };
}
