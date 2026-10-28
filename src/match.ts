// Turning a visual-search response into shoppable products. Kept free of
// Worker APIs so tests can import it directly.

export type Product = {
  title: string;
  link: string;
  store: string;
  storeIcon?: string;
  image?: string;
  price?: string;
  priceValue?: number;
  currency?: string;
  inStock?: boolean;
  exact?: boolean;
};

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : undefined);

// Sites that show the image but don't sell it.
const NOT_SHOPS = /(^|\.)(pinterest\.|instagram\.com|tiktok\.com|facebook\.com|x\.com|twitter\.com|reddit\.com|youtube\.com|tumblr\.com|wikipedia\.org|wikimedia\.org|weheartit\.com|lookbook\.nu|medium\.com|blogspot\.com|wordpress\.com|gettyimages\.|shutterstock\.com|alamy\.com|dreamstime\.com|istockphoto\.com)/i;

export function toProducts(data: unknown, max = 12): Product[] {
  const d = (data ?? {}) as Record<string, unknown>;
  const lists: [unknown, boolean][] = [[d.exact_matches, true], [d.products, false], [d.visual_matches, false]];
  const seen = new Set<string>(), out: Product[] = [];
  for (const [list, exact] of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const r = raw as Record<string, unknown>;
      const link = str(r.link, 2000);
      if (!link || !/^https?:\/\//.test(link)) continue;
      const h = host(link);
      if (!h || NOT_SHOPS.test(h)) continue;
      const key = link.split("?")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      const price = r.price as Record<string, unknown> | undefined;
      out.push({
        title: str(r.title, 160) ?? h,
        link,
        store: str(r.source, 60) ?? h,
        storeIcon: str(r.source_icon, 500),
        image: str(r.thumbnail, 1000) ?? str(r.image, 1000),
        price: str(price?.value, 30),
        priceValue: typeof price?.extracted_value === "number" ? price.extracted_value : undefined,
        currency: str(price?.currency, 8),
        inStock: typeof r.in_stock === "boolean" ? r.in_stock : undefined,
        exact,
      });
    }
  }
  // Things with a price are things you can buy: show them first.
  out.sort((a, b) => Number(!!b.price) - Number(!!a.price) || Number(!!b.exact) - Number(!!a.exact));
  return out.slice(0, max);
}
