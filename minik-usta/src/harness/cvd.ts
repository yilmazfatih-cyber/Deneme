/**
 * Colour-vision-deficiency simulation for the screen shots (docs/TECH_DESIGN.md §12.2 `--cvd`, §14.1 #15; review Faz 2
 * tur 1 #10): Machado, Oliveira & Fernandes 2009, severity 1.0, applied in linear RGB by an SVG `feColorMatrix` on the
 * `#game` element (CSS filter: the canvas itself is untouched, the game draws as usual).
 */
export const CVD_KINDS = ['protanopia', 'deuteranopia', 'tritanopia'] as const;
export type CvdKind = (typeof CVD_KINDS)[number];

/** Row-major 3 × 3 matrices (linear RGB). */
export const CVD_MATRICES: Readonly<Record<CvdKind, readonly number[]>> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

export function isCvdKind(v: string | null): v is CvdKind {
  return v !== null && (CVD_KINDS as readonly string[]).includes(v);
}

/** `feColorMatrix type="matrix"` values (4 × 5) of a 3 × 3 matrix. */
export function feColorMatrixValues(m: readonly number[]): string {
  const r = (i: number): string => `${m[i * 3] ?? 0} ${m[i * 3 + 1] ?? 0} ${m[i * 3 + 2] ?? 0} 0 0`;
  return `${r(0)} ${r(1)} ${r(2)} 0 0 0 1 0`;
}

/** Puts the filter on `#game` (harness page only). */
export function applyCvd(kind: CvdKind, doc: Document = document): void {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('style', 'position:absolute');
  const filter = doc.createElementNS(ns, 'filter');
  filter.setAttribute('id', 'harness-cvd');
  filter.setAttribute('color-interpolation-filters', 'linearRGB');
  const fm = doc.createElementNS(ns, 'feColorMatrix');
  fm.setAttribute('type', 'matrix');
  fm.setAttribute('values', feColorMatrixValues(CVD_MATRICES[kind]));
  filter.appendChild(fm);
  svg.appendChild(filter);
  doc.body.appendChild(svg);
  const game = doc.getElementById('game');
  if (game) game.style.filter = 'url(#harness-cvd)';
}
