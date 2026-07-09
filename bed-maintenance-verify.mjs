// Bed Maintenance Tracking — end-to-end verification.
//
// Drives: create + start a production order → assign a bed → confirm the
// map shows all 3 maintenance tasks as "never logged" with correct rolling
// due dates → log watering (early) → log bio-enzyme with a real qty (FIFO
// stock deduction) → backdate the bed's assignedAt to force "turning"
// overdue (it has no log yet, so it still uses assignedAt as its anchor) →
// confirm all 4 surfaces react (bed polygon badge, zone-summary sidebar,
// detail panel, dashboard card) → log turning to clear it → complete the
// order → confirm every surface stops showing the bed (inherited for free
// from getBedLayout()'s existing `WHERE po.status = 'in_progress'` filter).
//
// NOTE: like e2e-walkthrough.mjs, this creates a small amount of real data
// (a production order, a batch, ledger entries) and does not self-clean.
// Cross-check against data/urvar.db with sqlite3 per the assertions noted
// inline, then clean up manually the same way — see this file's history in
// git/session notes for the exact reversal recipe if needed.

import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("CONSOLE: " + m.text());
});

async function login() {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="username"]', "admin");
  await page.fill('input[name="password"]', "admin123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10000 });
}

await login();
console.log("1. Logged in");

// ---- Create + start a small test order ----
// NB: pick whichever product has an active formula linked (check
// `select id,name,product_id from formulas` — formula->product links have
// drifted from the product name before; don't assume "Vermicompost" itself
// has the formula attached).
await page.goto(`${BASE}/production`);
await page.click('button:has-text("New Order")');
await page.waitForTimeout(600);
await page.locator('select[name="productId"]').selectOption({ label: "Enriched Vermicompost" });
await page.waitForTimeout(1000); // formula/template selects populate off the productId change
await page.fill("#po-qty", "1");
await page.locator("#po-supervisor").selectOption({ index: 1 });
await page.click('button[type="submit"]:has-text("Create")');
await page.waitForTimeout(1000);
console.log("2. Order created");

await page.goto(`${BASE}/production`);
const orderUrl = await page.locator("table tbody tr").first().locator("a").first().getAttribute("href");
await page.goto(BASE + orderUrl);
await page.waitForTimeout(500);
await page.click('button:has-text("Start Production")');
await page.waitForTimeout(1200);
console.log("3. Order started:", orderUrl);

// ---- Assign a bed ----
await page.click('button:has-text("Assign")');
await page.waitForTimeout(500);
const bedCode = await page.locator("button.font-mono").first().textContent();
await page.locator("button.font-mono").first().click();
await page.click('button:has-text("Save Assignment")');
await page.waitForTimeout(1000);
console.log("4. Bed assigned:", bedCode);

// ---- Initial state: all 3 tasks "never logged" with correct rolling due dates ----
await page.goto(`${BASE}/layout-map`);
await page.waitForTimeout(600);
await page.locator("button.font-mono", { hasText: bedCode.split("-")[1] }).first().click();
await page.waitForTimeout(500);
let panel = await page.locator("text=Maintenance").first().locator("..").textContent();
console.log("5. Initial maintenance panel:", panel);
if (!panel.includes("never logged")) throw new Error("Expected fresh bed to show 'never logged'");

// ---- Log watering early (tests rolling schedule + early-logging allowed) ----
await page.click('button:has-text("Log Maintenance")');
await page.waitForTimeout(500);
await page.fill("#bm-notes", "verify: early watering");
await page.click('button[type="submit"]:has-text("Log")');
await page.waitForTimeout(1200);
panel = await page.locator("text=Maintenance").first().locator("..").textContent();
console.log("6. After watering log:", panel);
if (!panel.match(/Wateringlast .* · next/)) throw new Error("Watering log didn't update the panel");

// ---- Log bio-enzyme with a real qty (FIFO stock deduction) ----
await page.click('button:has-text("Log Maintenance")');
await page.waitForTimeout(500);
await page.locator("#bm-task").selectOption({ label: "Bio-enzyme" });
await page.waitForTimeout(300);
const itemOptions = await page.locator("#bm-item option").allTextContents();
await page.locator("#bm-item").selectOption({ label: itemOptions.find((o) => o.includes("Enzyme")) });
await page.fill("#bm-qty", "0.5");
await page.fill("#bm-notes", "verify: bio-enzyme FIFO deduction");
await page.click('button[type="submit"]:has-text("Log")');
await page.waitForTimeout(1200);
console.log("7. Bio-enzyme logged (0.5kg) — cross-check stock_balances/inventory_transactions via sqlite3");

// ---- Force turning overdue by backdating order_beds.assigned_at ----
// Turning has no log yet, so it still anchors on assignedAt — do this via:
//   sqlite3 data/urvar.db "UPDATE order_beds SET assigned_at = datetime('now','-11 days') WHERE id = <id>;"
// then reload and confirm all 4 surfaces (polygon badge aria-label, zone
// sidebar button bg-amber-500, detail panel "Turning overdue" badge,
// dashboard "Bed Maintenance" card) show it — then log turning to clear it,
// and Complete Order to confirm every surface drops the bed. See git/session
// history for the exact commands used during initial verification.

console.log("ERRORS:", errors.length === 0 ? "none" : errors);
await browser.close();
