// Drape for the browser: right-click an outfit (or click the toolbar button)
// and Drape opens with that image, finding every piece and where to buy it.
// No access to sites until you use it: the menu and the button grant this
// tab for one moment (activeTab), long enough to find the picture.
const DRAPE = "https://drape.jashparmar.com/";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "drape", title: "Find this look on Drape", contexts: ["image", "page", "link", "video"] });
});

const open = (src) => chrome.tabs.create({ url: src ? `${DRAPE}?shop=${encodeURIComponent(src)}` : DRAPE });

// Runs in the page: the largest picture in view (on Instagram the post image
// sits under an overlay, so a plain image right-click never fires).
function largestVisibleImage() {
  const vw = innerWidth, vh = innerHeight;
  let best = null, bestArea = 0;
  for (const img of document.images) {
    const r = img.getBoundingClientRect();
    const w = Math.min(r.right, vw) - Math.max(r.left, 0), h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    const src = img.currentSrc || img.src;
    if (w < 120 || h < 120 || !/^https:/.test(src)) continue;
    if (w * h > bestArea) { bestArea = w * h; best = src; }
  }
  return best;
}

async function fromTab(tab) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: largestVisibleImage });
    open(result);
  } catch {
    open(null); // pages extensions can't read (the Chrome Web Store, chrome:// pages)
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.mediaType === "image" && /^https:/.test(info.srcUrl ?? "")) open(info.srcUrl);
  else fromTab(tab);
});
chrome.action.onClicked.addListener(fromTab);
