// Computes the text embedding of every tag prompt with Marqo-FashionSigLIP's
// text model and writes public/models/tags.bin (Float32, row-major, unit
// length) plus tags.json (the order and dimensions). Phones then only need
// the vision model; the 111 MB text model never leaves this machine.
//   cd scripts && npm i && node embed-tags.mjs
import { writeFileSync } from "node:fs";
import { AutoTokenizer, SiglipTextModel } from "@huggingface/transformers";
import { promptIndex } from "../public/js/taxonomy.js";

const MODEL = "Marqo/marqo-fashionSigLIP";
const prompts = promptIndex();
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const model = await SiglipTextModel.from_pretrained(MODEL, { dtype: "q8" });

const inputs = tokenizer(prompts.map((p) => p.prompt), { padding: "max_length", truncation: true });
const { text_embeds } = await model(inputs);
const unit = text_embeds.normalize();
const [n, dim] = unit.dims;
writeFileSync(new URL("../public/models/tags.bin", import.meta.url), Buffer.from(new Float32Array(unit.data).buffer));
writeFileSync(new URL("../public/models/tags.json", import.meta.url), JSON.stringify({ model: MODEL, dim, count: n, prompts }, null, 1));
console.log(`Embedded ${n} prompts (${dim} dims).`);
