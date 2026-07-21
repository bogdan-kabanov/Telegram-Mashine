import { mkdirSync, readFileSync } from "fs";
import path from "path";
import { chromium } from "playwright";

const ref = path.resolve(
  "C:/Users/bogda/.cursor/projects/c-Users-bogda-OneDrive-Desktop-bot-ai/assets/c__Users_bogda_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-feecf6c4-6a85-43ac-9a06-6438a9eb720b.png",
);
const outDir = path.resolve("data/media/avatars");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "preview-default.png");

const dataUri = `data:image/png;base64,${readFileSync(ref).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<img id="i" src="${dataUri}" />`);
await page.waitForFunction(() => {
  const img = document.getElementById("i");
  return img && img.naturalWidth > 0;
});
const size = await page.evaluate(() => {
  const img = document.getElementById("i");
  return { w: img.naturalWidth, h: img.naturalHeight };
});

// Avatar circle on the right of the nav row (below status bar)
const avatarSize = Math.round(size.w * 0.092);
const x = Math.round(size.w * 0.855);
const y = Math.round(size.h * 0.58);
const clip = {
  x: x - Math.round(avatarSize / 2),
  y: y - Math.round(avatarSize / 2),
  width: avatarSize,
  height: avatarSize,
};

await page.screenshot({ path: out, clip });
console.log("saved", out, size, clip);
await browser.close();
