// Garment colours: k-means in CIELAB over the item's pixels, then each cluster
// is named by its nearest colour in a fashion palette (by ΔE). Lab makes
// "nearest" match what people see, and naming by palette keeps tags tidy
// ("navy", not "#1f2a44").

export const PALETTE = [
  ["black", "Black", "#1b1b1b"], ["charcoal", "Charcoal", "#3f4144"], ["grey", "Grey", "#8d8f93"], ["white", "White", "#f5f5f2"],
  ["cream", "Cream", "#ece2c9"], ["beige", "Beige", "#d6c3a0"], ["camel", "Camel", "#b98a55"], ["brown", "Brown", "#6b4428"],
  ["navy", "Navy", "#1f2a48"], ["blue", "Blue", "#2f5fae"], ["light-blue", "Light blue", "#9cc3e6"], ["denim", "Denim", "#4a6382"],
  ["teal", "Teal", "#1f7a7a"], ["green", "Green", "#2f7d43"], ["olive", "Olive", "#6b6b32"], ["mint", "Mint", "#aedfc6"],
  ["yellow", "Yellow", "#ecc63a"], ["mustard", "Mustard", "#c99a24"], ["orange", "Orange", "#e0762f"], ["red", "Red", "#c1292e"],
  ["burgundy", "Burgundy", "#6b1f2c"], ["pink", "Pink", "#eaa0b8"], ["hot-pink", "Hot pink", "#d6337b"], ["purple", "Purple", "#6b3f9e"],
  ["lavender", "Lavender", "#bba7dd"], ["khaki", "Khaki", "#a89c6c"],
];

// Neutrals go with nearly everything; outfit scoring uses this.
export const NEUTRALS = new Set(["black", "charcoal", "grey", "white", "cream", "beige", "camel", "brown", "navy", "denim", "khaki"]);

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export function rgbToLab(r, g, b) {
  const [R, G, B] = [r, g, b].map((v) => srgbToLinear(v / 255));
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
export const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const rgbToHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const PAL_LAB = PALETTE.map(([id, label, hex]) => ({ id, label, hex, lab: rgbToLab(...hexToRgb(hex)) }));

export function nameColour(r, g, b) {
  const lab = rgbToLab(r, g, b);
  let best = PAL_LAB[0], d = Infinity;
  for (const p of PAL_LAB) { const dd = dist2(lab, p.lab); if (dd < d) { d = dd; best = p; } }
  return best;
}

// pixels: Uint8ClampedArray RGBA; only pixels with alpha > 127 count.
// Returns up to `k` colours, largest share first, merging clusters with the same name.
export function dominantColours(pixels, { k = 3, sample = 4000, minShare = 0.08, seed = 7 } = {}) {
  const pts = [];
  const opaque = [];
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 127) opaque.push(i);
  if (!opaque.length) return [];
  const step = Math.max(1, Math.floor(opaque.length / sample));
  for (let j = 0; j < opaque.length; j += step) { const i = opaque[j]; pts.push({ lab: rgbToLab(pixels[i], pixels[i + 1], pixels[i + 2]), rgb: [pixels[i], pixels[i + 1], pixels[i + 2]] }); }
  // k-means++ style seeding, deterministic.
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const centres = [pts[Math.floor(rand() * pts.length)].lab];
  while (centres.length < Math.min(k, pts.length)) {
    const d = pts.map((p) => Math.min(...centres.map((c) => dist2(p.lab, c))));
    const total = d.reduce((a, b) => a + b, 0);
    let r = rand() * total, idx = 0;
    while (r > d[idx] && idx < d.length - 1) { r -= d[idx]; idx++; }
    centres.push(pts[idx].lab);
  }
  let assign = new Array(pts.length).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    assign = pts.map((p) => { let best = 0, bd = Infinity; centres.forEach((c, ci) => { const dd = dist2(p.lab, c); if (dd < bd) { bd = dd; best = ci; } }); return best; });
    centres.forEach((_, ci) => {
      const mine = pts.filter((_, pi) => assign[pi] === ci);
      if (mine.length) centres[ci] = [0, 1, 2].map((a) => mine.reduce((s2, p) => s2 + p.lab[a], 0) / mine.length);
    });
  }
  const clusters = centres.map((_, ci) => {
    const mine = pts.filter((_, pi) => assign[pi] === ci);
    const rgb = [0, 1, 2].map((a) => mine.reduce((s2, p) => s2 + p.rgb[a], 0) / Math.max(1, mine.length));
    return { share: mine.length / pts.length, rgb };
  }).filter((c) => c.share > 0);
  const named = new Map();
  for (const c of clusters) {
    const n = nameColour(...c.rgb);
    const prev = named.get(n.id);
    if (prev) { prev.share += c.share; } else named.set(n.id, { id: n.id, label: n.label, hex: rgbToHex(...c.rgb), share: c.share });
  }
  return [...named.values()].filter((c) => c.share >= minShare).sort((a, b) => b.share - a.share).map((c) => ({ ...c, share: Math.round(c.share * 100) / 100 }));
}
