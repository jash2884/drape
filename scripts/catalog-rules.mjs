// Which Drape category a product belongs to, from its store category path and
// title. Shared by the Amazon seed (catalog-pull.mjs) and affiliate feeds
// (catalog-feed.mjs). The embedding step double-checks every assignment.
import { CATEGORIES } from "../public/js/taxonomy.js";

export // [category, test on "path | title"] — first match wins, so specific before general.
const RULES = [
  ["kurta", /\bkurta|kurti\b/i],
  ["denim-jacket", /Jackets & Coats.*\|.*\b(denim|jean) jacket/i],
  ["leather-jacket", /Leather & Faux Leather|Jackets & Coats.*\|.*leather jacket/i],
  ["puffer", /Down & Down Alternative|Jackets & Coats.*\|.*\b(puffer|down jacket|quilted)/i],
  ["blazer", /Suits & Sport Coats|Blazers|\|.*\bblazer\b/i],
  ["coat", /Trench, Rain|Wool & Blends|Pea Coats|Jackets & Coats.*\|.*\b(coat|trench|overcoat)\b/i],
  ["cardigan", /Cardigans|Sweaters.*\|.*cardigan/i],
  ["jacket", /Jackets & Coats|Active Jackets|Lightweight Jackets/i],
  ["hoodie", /Hoodies.*\|.*\b(hoodie|hooded)\b/i],
  ["sweatshirt", /Hoodies & Sweatshirts|Sweatshirts/i],
  ["sweater", /Sweaters/i],
  ["polo", /Polos/i],
  ["tank", /Tanks & Camis|Tank Tops|\btanks\b/i],
  ["tshirt", /T-Shirts|Tees\b/i],
  ["blouse", /Women.*Blouses/i],
  ["shirt", /Button-Down|Dress Shirts|Casual Shirts|Blouses & Button/i],
  ["jeans", /\bJeans\b/i],
  ["leggings", /Leggings/i],
  ["joggers", /\|.*\b(jogger|sweatpant)/i],
  ["chinos", /Pants.*\|.*\bchino/i],
  ["shorts", /\bShorts\b/i],
  ["skirt", /Skirts/i],
  ["trousers", /\bPants\b/i],
  ["jumpsuit", /Jumpsuits|Rompers|Overalls/i],
  ["dress", /\bDresses\b/i],
  ["boots", /\bBoots\b/i],
  ["sneakers", /Fashion Sneakers|Athletic.*\|.*sneaker|Walking|Running/i],
  ["loafers", /Loafers/i],
  ["dress-shoes", /Oxfords|Dress Shoes/i],
  ["heels", /Pumps|Heeled|\bHeels\b/i],
  ["sandals", /Sandals|Slides/i],
  ["flats", /\bFlats\b/i],
  ["backpack", /Backpacks/i],
  ["bag", /Handbags|Shoulder Bags|Crossbody|Totes|Clutches|Hobo|Satchels/i],
  ["cap", /Baseball Caps/i],
  ["hat", /Hats & Caps|Fedoras|Sun Hats|Beanies|Bucket Hats/i],
  ["scarf", /Scarves/i],
  ["belt", /\bBelts\b/i],
  ["watch", /Wrist Watches/i],
  ["sunglasses", /Sunglasses/i],
  ["jewellery", /Necklaces|Earrings|Bracelets|\bRings\b/i],
];
export const SKIP = /\b(Girls|Boys|Baby|Toddler|Kids|Costumes|Uniforms|Novelty|Maternity|Lingerie|Underwear|Socks|Sleep|Shoe Care|Accessories > Wallets)\b/i;

const known = new Set(CATEGORIES.map((c) => c[0]));
for (const [c] of RULES) if (!known.has(c)) throw new Error(`unknown category ${c}`);

export function categorise(path, title) {
  if (!path || SKIP.test(path) || SKIP.test(title ?? "")) return null;
  return RULES.find(([, re]) => re.test(`${path} | ${title}`))?.[0] ?? null;
}

export const genderOf = (text) => (/\b(women|womens|women's|ladies|female)\b/i.test(text) ? "w" : /\b(men|mens|men's|male)\b/i.test(text) ? "m" : "u");
