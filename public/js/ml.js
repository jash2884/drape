// Promise wrapper around the ML worker. One worker for the whole session.
let worker = null, seq = 0;
const waiting = new Map(), listeners = new Set();

function start() {
  if (worker) return worker;
  worker = new Worker(new URL("./ml.worker.js", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") { for (const fn of listeners) fn(data); return; }
    const p = waiting.get(data.id);
    if (!p) return;
    waiting.delete(data.id);
    data.type === "error" ? p.reject(new Error(data.error)) : p.resolve(data);
  };
  worker.onerror = (e) => { for (const p of waiting.values()) p.reject(new Error(e.message || "The AI worker crashed.")); waiting.clear(); };
  return worker;
}

function call(type, payload = {}, transfer = []) {
  start();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, type, ...payload }, transfer);
  });
}

export const onProgress = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const ready = () => call("init");
export const setImage = (imageId, blob) => call("image", { imageId, blob });
export const segment = (imageId, points) => call("segment", { imageId, points });
export const autoSegment = (imageId) => call("auto", { imageId });
export const embed = (blob) => call("embed", { blob });
