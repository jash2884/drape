// Where to shop a piece. Until the product catalogue is live, each piece gets
// store search links built from its description. Affiliate tags go here once
// the accounts are approved (empty = plain links).
import { labelOf } from "./taxonomy.js";

// amazon: your Associates tracking ID (e.g. "drape-20").
// awin: your Awin publisher ID, and the advertiser ID of each shop you're
// approved for, by the shop's domain.
export const AFFILIATE = { amazon: "", awin: { publisher: "", merchants: { /* "asos.com": "12345" */ } } };

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\d?\./, ""); } catch { return ""; } };

// Any shop link, tracked where Drape has an affiliate deal for that shop.
export function affiliate(url) {
  const host = hostOf(url);
  if (AFFILIATE.amazon && /(^|\.)amazon\.com$/.test(host)) {
    const u = new URL(url); u.searchParams.set("tag", AFFILIATE.amazon); return u.toString();
  }
  const merchant = Object.entries(AFFILIATE.awin.merchants).find(([d]) => host === d || host.endsWith(`.${d}`))?.[1];
  if (AFFILIATE.awin.publisher && merchant) return `https://www.awin1.com/cread.php?awinmid=${merchant}&awinaffid=${AFFILIATE.awin.publisher}&ued=${encodeURIComponent(url)}`;
  return url;
}

export const STORES = [
  { id: "amazon", name: "Amazon", url: (q) => `https://www.amazon.com/s?k=${q}` },
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

export const shopLinks = (tags) => STORES.map((s) => ({ ...s, href: affiliate(s.url(encodeURIComponent(describe(tags)))) }));
