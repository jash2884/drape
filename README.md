# Drape

**Shop your closet first.** Snap what you own; Drape cuts each item out and tags it with AI that runs on your phone, then (next) plans outfits and tells you whether a new buy is worth it: how many outfits it unlocks and whether you already own something like it.

## How it works (Week 1)
- **Find the garment automatically.** SlimSAM proposes masks from a grid of points; masks that are tiny, huge or hug the frame are dropped; Marqo-FashionSigLIP scores the rest against "a piece of clothing" vs background prompts and the most clothing-like wins. Tap to keep or remove areas if needed. Small specks are removed and holes filled.
- **Tag it zero-shot.** The cut-out's fashion embedding is compared with precomputed text embeddings for 41 categories, patterns, styles and warmth. 86.7% top-1 / 97% top-3 category accuracy on 300 labelled product photos (`scripts/eval-tags.mjs`). Colours come from k-means in CIELAB, named against a fashion palette.
- **Duplicates.** Embedding similarity flags things you already own.
- **Private and free to run.** Models (~110 MB, once) run in a Web Worker with multi-threaded WebAssembly (the site is cross-origin isolated). The closet is stored in IndexedDB on the device. Every tag correction is saved next to the prediction for future training.

## Develop
```
npm test
npm run dev            # http://localhost:8880
cd scripts && npm i && node embed-tags.mjs   # after editing the taxonomy
node scripts/eval-tags.mjs 300               # tagging accuracy
```
