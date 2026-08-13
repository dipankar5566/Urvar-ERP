// Reproduces "buttons not working" through the PUBLIC url, the way users hit it.
// Strictly read-only: it clicks controls that open dialogs and then presses
// Escape. It never submits a form or clicks an action that writes.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "https://erp.urvarindia.com";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();

const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
page.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 160)));
page.on("requestfailed", (r) => errs.push(`requestfailed ${r.failure()?.errorText} ${r.url().slice(0, 90)}`));
page.on("response", (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().slice(0, 90)}`); });

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.fill("#username", "admin");
await page.fill("#password", "admin123");
await page.click("button[type=submit]");
await page.waitForURL(/dashboard/, { timeout: 60000 });
console.log(`login OK  (errors during login: ${errs.length})`);
for (const e of [...new Set(errs)].slice(0, 5)) console.log("   " + e);

// Buttons that only open a dialog — safe to click.
const SAFE = [
  ["/procurement", "New PO"],
  ["/production", "New Order"],
  ["/inventory", "Goods Receipt"],
  ["/inventory", "Transfer"],
  ["/inventory", "Adjustment"],
  ["/masters", "Add Product"],
  ["/quality", "New CAPA"],
];

for (const [route, label] of SAFE) {
  errs.length = 0;
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);

  const btn = page.locator(`button:has-text("${label}")`).first();
  if ((await btn.count()) === 0) { console.log(`SKIP    ${route.padEnd(14)} "${label}" not present`); continue; }

  await btn.click().catch((e) => errs.push("click threw: " + e.message.slice(0, 80)));
  await page.waitForTimeout(2500);
  const opened = (await page.locator("[role=dialog]").count()) > 0;
  console.log(`${opened ? "ok     " : "BROKEN "} ${route.padEnd(14)} "${label}" -> dialog ${opened ? "opened" : "DID NOT OPEN"}`);
  for (const e of [...new Set(errs)].slice(0, 3)) console.log("   " + e);
  if (opened) { await page.keyboard.press("Escape"); await page.waitForTimeout(500); }
}

// Tab switching is pure client state — a good probe for dead client JS.
errs.length = 0;
await page.goto(`${BASE}/inventory`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2000);
const before = await page.locator("body").innerText();
await page.locator("button:has-text('Ledger'), [role=tab]:has-text('Ledger')").first().click().catch(() => {});
await page.waitForTimeout(2000);
const after = await page.locator("body").innerText();
console.log(`\nclient-side tab switch: ${before !== after ? "WORKS (content changed)" : "DEAD (nothing changed)"}`);
for (const e of [...new Set(errs)].slice(0, 5)) console.log("   " + e);

await browser.close();
