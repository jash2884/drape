// Zero-shot tagging: compare a unit image embedding with the precomputed unit
// text embeddings of every option, softmax within each group. Pure, so it runs
// in the browser worker, in Node scripts and in tests.

export function classify(embedding, bank, meta, { scale = 100 } = {}) {
  const dim = meta.dim, out = {};
  const byGroup = new Map();
  meta.prompts.forEach((p, i) => {
    let s = 0;
    const off = i * dim;
    for (let k = 0; k < dim; k++) s += embedding[k] * bank[off + k];
    if (!byGroup.has(p.group)) byGroup.set(p.group, []);
    byGroup.get(p.group).push({ id: p.id, score: s });
  });
  for (const [group, list] of byGroup) {
    const max = Math.max(...list.map((x) => x.score));
    const exp = list.map((x) => Math.exp(scale * (x.score - max)));
    const sum = exp.reduce((a, b) => a + b, 0);
    const top = list.map((x, i) => ({ id: x.id, p: exp[i] / sum })).sort((a, b) => b.p - a.p);
    out[group] = { id: top[0].id, confidence: top[0].p, top: top.slice(0, 5), all: top };
  }
  return out;
}

export function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// The best option of a group among an allowed set, renormalised (e.g. the
// parser says "pants", so only bottoms are possible).
export function within(group, allowed) {
  const keep = group.all.filter((t) => allowed.includes(t.id));
  if (!keep.length) return group;
  const sum = keep.reduce((s, t) => s + t.p, 0);
  const top = keep.map((t) => ({ id: t.id, p: t.p / sum }));
  return { id: top[0].id, confidence: top[0].p, top: top.slice(0, 5), all: top };
}
