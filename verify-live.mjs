// Confirms the live site genuinely works: logs in and loads every page,
// failing on any 4xx/5xx sub-resource. A 200 on the HTML alone is not
// evidence — the previous outage served 200 shells whose JS chunks 500'd.
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "https://erp.urvarindia.com";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();

let failures = 0;
const bad = [];
page.on("response", (r) => { if (r.status() >= 400) bad.push(`HTTP ${r.status()} ${r.url().split("/").pop().slice(0, 60)}`); });
page.on("pageerror", (e) => bad.push(`pageerror: ${e.message.slice(0, 100)}`));

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.fill("#username", "admin");
await page.fill("#password", "admin123");
await page.click("button[type=submit]");
await page.waitForURL(/dashboard/, { timeout: 60000 });
console.log("login: OK\n");

for (const p of ["/dashboard", "/production", "/inventory", "/batches", "/procurement", "/layout-map", "/quality", "/masters"]) {
  bad.length = 0;
  await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);
  const text = (await page.locator("body").innerText()).trim();
  const ok = text.length > 200 && bad.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? "ok     " : "PROBLEM"} ${p.padEnd(14)} ${String(text.length).padStart(5)} chars${bad.length ? "  " + bad[0] : ""}`);
}

// Spot-check that restored data is actually rendering.
await page.goto(`${BASE}/inventory`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2500);
const inv = await page.locator("body").innerText();
console.log(`\nstock rows visible: ${/Cow Dung|Vermicompost/.test(inv) ? "yes" : "NO"}`);
console.log(`plant name shows Tantipara: ${/Tantipara/.test(inv) ? "yes" : "NO"}`);

await browser.close();
console.log(failures === 0 ? "\nLIVE SITE HEALTHY" : `\n${failures} PAGE(S) BROKEN`);
process.exit(failures ? 1 : 0);
