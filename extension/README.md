# Drape for Chrome

Right-click any outfit (or click the toolbar button) to open it in Drape.

Permissions: `contextMenus`, `activeTab`, `scripting`. No host permissions:
the extension can only look at a page at the moment you use it, and only to
find the picture. The image URL is sent to drape.jashparmar.com, which fetches
the picture and runs the look on your device.

Try it: chrome://extensions → Developer mode → Load unpacked → this folder.
Publish: zip this folder (`npm run extension`) and upload it to the Chrome Web
Store developer dashboard (one-time $5 developer fee, owner's account).
