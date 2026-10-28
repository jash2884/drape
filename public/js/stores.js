// Where to shop a piece. Until the product catalogue is live, each piece gets
// store search links built from its description. Affiliate tags go here once
// the accounts are approved (empty = plain links).
import { labelOf } from "./taxonomy.js";

export const AFFILIATE = { amazon: "" };

export const STORES = [
  { id: "amazon", name: "Amazon", url: (q) => `https://www.amazon.com/s?k=${q}${AFFILIATE.amazon ? `&tag=${AFFILIATE.amazon}` : ""}` },
  { id: "asos", name: "ASOS", url: (q) => `https://www.asos.com/search/?q=${q}` },
  { id: "hm", name: "H&M", url: (q) => `https://www2.hm.com/en_us/search-results.html?q=${q}` },
  { id: "zara", name: "Zara", url: (q) => `https://www.zara.com/us/en/search?searchTerm=${q}` },
  { id: "google", name: "Google Shopping", url: (q) => `https://www.google.com/search?tbm=shop&q=${q}` },
];

// "charcoal textured knit sweater": colour, a non-plain pattern, the type.
export function describe(tags) {
  const colour = tags.colours?.[0]?.label?.toLowerCase();
  const pattern = tags.pattern && !["solid", "textured"].includes(tags.pattern) ? labelOf("pattern", tags.pattern).toLowerCase() : tags.pattern === "textured" ? "textured" : null;
  const style = tags.style === "formal" ? "formal" : tags.style === "sporty" ? "sport" : null;
  return [colour, pattern, style, labelOf("category", tags.category).toLowerCase()].filter(Boolean).join(" ");
}

export const shopLinks = (tags) => STORES.map((s) => ({ ...s, href: s.url(encodeURIComponent(describe(tags))) }));
