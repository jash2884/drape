# Drape

**Find the look for less.** Screenshot any outfit; Drape finds every piece with AI that runs on your device and shows where to buy it, plus cheaper lookalikes. No sign-up, no uploads.

## How it works
- **Find every piece.** On photos of people, a clothing parser (segformer_b2_clothes) labels hat, top, pants, shoes, bag and so on for every pixel; Drape keeps the main person (the largest figure near the centre), so background crowds and bare skin are ignored. Photos without a person fall back to SAM proposals scored by a fashion model.
- **Name each piece.** Marqo-FashionSigLIP compares each cut-out with precomputed text embeddings, restricted to what the region can be (an "upper-clothes" region is a top or a layer). Colours come from k-means in CIELAB, named against a fashion palette.
- **Shop it.** Store search links built from the description; visual lookalikes from a product catalogue are next.
- **Private and free to run.** All three models run on the device in a Web Worker with multi-threaded WebAssembly (the site is cross-origin isolated); looks are stored in IndexedDB. No sign-up.
- **Tuned on real photos.** `scripts/look-debug.mjs` runs the same engine in Node and writes annotated images.

**Licence note:** the clothing parser was trained on a research human-parsing dataset. Before a commercial launch, retrain it on commercially licensed data (e.g. Fashionpedia, CC BY 4.0).

## Develop
```
npm test
npm run dev            # http://localhost:8880
cd scripts && npm i && node embed-tags.mjs   # after editing the taxonomy
node scripts/eval-tags.mjs 300               # tagging accuracy
cd scripts && node look-debug.mjs ../test/fixtures/street-04.jpg   # detection on a photo
```

## Lookalike catalogue

Cheaper lookalikes come from Drape's own catalogue, searched on the device
(public/js/catalog.js): one shard per category of int8 fashion embeddings plus
product details and main colour. Rebuild it with:

    cd scripts
    node catalog-pull.mjs 250 8   # stream Amazon 2023 metadata into data/candidates.jsonl
    node catalog-embed.mjs        # embed photos, check categories, write public/catalog/*
    node catalog-colours.mjs      # main colour per product, bumps the catalogue version

The seed uses Amazon's 2023 public metadata: prices are dated and some items
will be gone. Replace it with live affiliate feeds (Amazon Creators API,
Awin, Impact) before launch.

## Sharing and the browser extension

- **Share this look** (look page) draws a 1080×1350 card on the device: the
  photo with numbered pieces and the best price for each. Phones get the share
  sheet; desktops download the PNG.
- **extension/** is a Chrome extension: right-click any outfit, or click the
  toolbar button on Instagram/Pinterest, and Drape opens it via
  `/?shop=<image URL>` (fetched through `/api/thumb`). Permissions are
  `contextMenus`, `activeTab` and `scripting` only. `npm run extension` builds
  drape-extension.zip for the Chrome Web Store.

## Affiliate links

Set IDs in `public/js/stores.js` (`AFFILIATE`): an Amazon Associates tag, and
an Awin publisher ID with the advertiser ID of each approved shop. Every link
(store searches, exact matches, lookalikes) goes through `affiliate()`.
Product feeds from Awin or Impact join the catalogue with
`node scripts/catalog-feed.mjs <feed.csv.gz>`, then the embed and colour steps.
