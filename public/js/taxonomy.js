// What Drape knows about clothes. Each tag group is a zero-shot classifier:
// the item's image embedding is compared with the text embedding of every
// option's prompt (computed once by scripts/embed-tags.mjs, shipped in
// public/models/tags.bin). The slot says where an item goes in an outfit.

export const SLOTS = {
  top: "Top",
  outer: "Layer",
  bottom: "Bottom",
  onepiece: "One-piece",
  shoes: "Shoes",
  accessory: "Accessory",
};

// [id, label, slot, prompt]
export const CATEGORIES = [
  ["tshirt", "T-shirt", "top", "a t-shirt"],
  ["shirt", "Shirt", "top", "a button-up shirt"],
  ["blouse", "Blouse", "top", "a blouse"],
  ["polo", "Polo shirt", "top", "a polo shirt"],
  ["tank", "Tank top", "top", "a tank top"],
  ["sweater", "Sweater", "top", "a knit sweater"],
  ["hoodie", "Hoodie", "top", "a hoodie"],
  ["sweatshirt", "Sweatshirt", "top", "a crewneck sweatshirt"],
  ["kurta", "Kurta", "top", "a kurta"],
  ["jacket", "Jacket", "outer", "a jacket"],
  ["denim-jacket", "Denim jacket", "outer", "a denim jacket"],
  ["leather-jacket", "Leather jacket", "outer", "a leather jacket"],
  ["puffer", "Puffer jacket", "outer", "a puffer jacket"],
  ["coat", "Coat", "outer", "a long coat"],
  ["blazer", "Blazer", "outer", "a blazer"],
  ["cardigan", "Cardigan", "outer", "a cardigan"],
  ["jeans", "Jeans", "bottom", "jeans"],
  ["trousers", "Trousers", "bottom", "tailored trousers"],
  ["chinos", "Chinos", "bottom", "chino pants"],
  ["joggers", "Joggers", "bottom", "jogger sweatpants"],
  ["shorts", "Shorts", "bottom", "shorts"],
  ["skirt", "Skirt", "bottom", "a skirt"],
  ["leggings", "Leggings", "bottom", "leggings"],
  ["dress", "Dress", "onepiece", "a dress"],
  ["jumpsuit", "Jumpsuit", "onepiece", "a jumpsuit"],
  ["sneakers", "Sneakers", "shoes", "sneakers"],
  ["boots", "Boots", "shoes", "boots"],
  ["loafers", "Loafers", "shoes", "loafers"],
  ["dress-shoes", "Dress shoes", "shoes", "leather oxford dress shoes"],
  ["heels", "Heels", "shoes", "high heels"],
  ["sandals", "Sandals", "shoes", "sandals"],
  ["flats", "Flats", "shoes", "ballet flats"],
  ["bag", "Bag", "accessory", "a handbag"],
  ["backpack", "Backpack", "accessory", "a backpack"],
  ["cap", "Cap", "accessory", "a baseball cap"],
  ["hat", "Hat", "accessory", "a hat"],
  ["scarf", "Scarf", "accessory", "a scarf"],
  ["belt", "Belt", "accessory", "a belt"],
  ["watch", "Watch", "accessory", "a wristwatch"],
  ["sunglasses", "Sunglasses", "accessory", "sunglasses"],
  ["jewellery", "Jewellery", "accessory", "jewelry"],
];

// Other tag groups: [id, label, prompt]
export const GROUPS = {
  pattern: [
    ["solid", "Solid", "a plain solid-colour garment"],
    ["striped", "Striped", "a striped garment"],
    ["checked", "Checked", "a plaid checked garment"],
    ["floral", "Floral", "a floral print garment"],
    ["graphic", "Graphic", "a garment with a graphic print"],
    ["polka", "Polka dot", "a polka dot garment"],
    ["animal", "Animal print", "an animal print garment"],
    ["textured", "Textured", "a textured knit or ribbed garment"],
  ],
  style: [
    ["casual", "Casual", "casual everyday clothing"],
    ["smart", "Smart casual", "smart casual clothing"],
    ["formal", "Formal", "formal elegant business clothing"],
    ["sporty", "Sporty", "athletic sportswear"],
    ["street", "Streetwear", "streetwear"],
    ["party", "Party", "party evening wear"],
    ["lounge", "Lounge", "comfortable loungewear"],
  ],
  warmth: [
    ["light", "Light", "lightweight summer clothing"],
    ["mid", "Mid-season", "mid-season spring clothing"],
    ["warm", "Warm", "warm thick winter clothing"],
  ],
  // Is a cut-out actually clothing? Used to pick the garment automatically.
  subject: [
    ["clothing", "Clothing", "a single piece of clothing, footwear or a fashion accessory"],
    ["background", "Background", "a background: a wall, floor, ground, grass, stone, table or furniture"],
    ["person", "Person", "a whole person standing"],
    ["skin", "Bare skin", "bare skin: bare legs or bare arms"],
    ["face", "Face", "a face with hair"],
    ["clutter", "Clutter", "a cluttered room with many objects"],
  ],
};

export const TAG_GROUPS = {
  category: CATEGORIES.map(([id, label, , prompt]) => [id, label, prompt]),
  ...GROUPS,
};

export const slotOf = (categoryId) => CATEGORIES.find((c) => c[0] === categoryId)?.[2] ?? "accessory";
export const labelOf = (group, id) => TAG_GROUPS[group]?.find((o) => o[0] === id)?.[1] ?? id;

// Every prompt in a fixed order; tags.bin holds one embedding per entry.
export function promptIndex() {
  const out = [];
  for (const [group, options] of Object.entries(TAG_GROUPS)) for (const [id, , prompt] of options) out.push({ group, id, prompt });
  return out;
}
