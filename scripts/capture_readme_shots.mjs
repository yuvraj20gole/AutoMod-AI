/**
 * Capture README screenshots. Reuses .auth/state.json when present.
 * Never prints credentials.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const AUTH = path.join(ROOT, ".auth", "state.json");
const OUT = path.join(ROOT, "docs", "screenshots");
const BASE = "http://localhost:3000";
const COROLLA_ID = "fc3bca33-04d2-4522-89da-7ab9f8b6a201";

const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE = 1.5;

async function hideNextBadge(page) {
  await page
    .addStyleTag({
      content: `nextjs-portal,[data-nextjs-toast],[data-next-mark],#__next-build-watcher{display:none!important}`,
    })
    .catch(() => {});
}

async function waitImages(page) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      const imgs = [...document.images];
      await Promise.all(
        imgs.map(
          (img) =>
            img.complete ||
            new Promise((res) => {
              img.addEventListener("load", res, { once: true });
              img.addEventListener("error", res, { once: true });
              setTimeout(res, 6000);
            })
        )
      );
    });
  } catch {
    /* navigation mid-wait — ignore */
  }
  await page.waitForTimeout(400);
}

async function shot(page, name) {
  await hideNextBadge(page);
  await waitImages(page);
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, type: "png", fullPage: false });
  console.log("saved", name, fs.statSync(dest).size);
}

async function ensureAuth(browser) {
  if (fs.existsSync(AUTH)) {
    console.log("Reusing .auth/state.json");
    return;
  }
  fs.mkdirSync(path.dirname(AUTH), { recursive: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log("\n>>> Log in in the Chromium window. Waiting up to 3 minutes for /dashboard…\n");
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (page.url().includes("/dashboard")) {
      await context.storageState({ path: AUTH });
      console.log("Auth saved");
      await context.close();
      return;
    }
    await page.waitForTimeout(1000);
  }
  await context.close();
  throw new Error("Timed out waiting for login (3 minutes).");
}

async function main() {
  try {
    const r = await fetch(`${BASE}/login`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } catch {
    console.error("localhost:3000 not reachable — start the app and retry.");
    process.exit(2);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  await ensureAuth(browser);

  // Hero — logged out
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2000);
    await shot(page, "hero.png");
    await ctx.close();
  }

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    storageState: AUTH,
  });
  const page = await context.newPage();

  // My Builds
  await page.goto(`${BASE}/dashboard/builds`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);
  await shot(page, "my-builds.png");

  // studio-before-after: candy_red Fast — slider on My Builds
  const candyCard = page.locator("div").filter({ hasText: /candy red/i }).first();
  if (await candyCard.count()) {
    await candyCard.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
  }
  await shot(page, "studio-before-after.png");

  // studio-detailed: Studio with Detailed selected
  await page.goto(`${BASE}/dashboard/cars/${COROLLA_ID}/studio`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForTimeout(2000);
  const detailed = page.getByRole("button", { name: /Detailed/i });
  if (await detailed.count()) {
    await detailed.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
  } else {
    // try radio / tab text
    await page.locator("text=Detailed").first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  const lip = page.getByRole("button", { name: /Lip spoiler/i });
  if (await lip.count()) {
    await lip.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  await shot(page, "studio-detailed.png");

  // Advisor hub with Corolla + one answered turn
  await page.goto(`${BASE}/dashboard/advisor?carId=${COROLLA_ID}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(1500);
  // Hub may show car cards — click through if needed
  if (!(await page.locator("textarea, input[type='text']").count())) {
    const pick = page.locator("button, a").filter({ hasText: /Corolla|Start|Chat/i }).first();
    if (await pick.count()) {
      await pick.click().catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  const input = page.locator("textarea").first();
  if (await input.count()) {
    await input.fill("more power under 50k");
    const send = page.locator("button[type='submit']").or(page.getByRole("button", { name: /send/i }));
    if (await send.count()) await send.first().click().catch(() => {});
    else await input.press("Enter").catch(() => {});
    await page.waitForTimeout(10000);
  }
  await shot(page, "advisor-hub.png");

  await context.close();
  await browser.close();
  console.log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
