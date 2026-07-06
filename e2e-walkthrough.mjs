// End-to-end walkthrough of the Phase 1 manufacturing loop.
// Drives the real UI via system Chrome. Screenshots land in ./e2e-shots/.
import { chromium } from "playwright";
import fs from "fs";

const BASE = "http://localhost:3001";
const SHOTS = "./e2e-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let step = 0;

async function shot(name) {
  step++;
  await page.screenshot({ path: `${SHOTS}/${String(step).padStart(2, "0")}-${name}.png`, fullPage: false });
  console.log(`📸 ${step}-${name}`);
}

async function toastText() {
  try {
    const t = page.locator("[data-sonner-toast]").last();
    await t.waitFor({ timeout: 5000 });
    return (await t.innerText()).trim().replace(/\n/g, " ");
  } catch {
    return "(no toast)";
  }
}

// ---------- 1. Login as admin ----------
await page.goto(`${BASE}/login`);
await page.fill("#username", "admin");
await page.fill("#password", "admin123");
await shot("login");
await page.click("button[type=submit]");
await page.waitForURL("**/dashboard", { timeout: 15000 });
await shot("dashboard-empty");
console.log("✅ Logged in as admin → dashboard");

// ---------- 2. Goods receipts ----------
async function goodsReceipt(itemLabelPart, qty, supplier) {
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Goods Receipt')");
  await page.waitForSelector("#gr-item");
  await page.selectOption("#gr-item", { label: itemLabelPart });
  await page.fill("#gr-qty", String(qty));
  await page.fill("#gr-supplier", supplier);
  await page.click("button:has-text('Receive')");
  console.log(`   receipt ${itemLabelPart} ×${qty}: ${await toastText()}`);
  await page.waitForTimeout(400);
}

await goodsReceipt("Cow Dung (ton)", 20, "Ghosh Dairy Farm");
await goodsReceipt("Agricultural Waste (ton)", 8, "Local Farmers Co-op");
await goodsReceipt("HDPE Bag 25kg (nos)", 1000, "Kolkata Packaging Co");
await shot("inventory-after-receipts");
console.log("✅ Goods receipts recorded");

// ---------- 3. Create production order ----------
await page.goto(`${BASE}/production`);
await page.click("button:has-text('New Order')");
await page.waitForSelector("#po-qty");
await page.selectOption("#po-product", { label: "Vermicompost" });
await page.fill("#po-qty", "5");
await page.selectOption("#po-supervisor", { label: "Production Supervisor" });
await shot("new-order-dialog");
await page.click("button:has-text('Create Order')");
console.log(`   create order: ${await toastText()}`);
await page.waitForTimeout(400);
await shot("orders-list");

// ---------- 4. Start order → materials issued FIFO ----------
await page.click("table a >> nth=0");
await page.waitForSelector("text=Manufacturing Stages");
await shot("order-draft");
await page.click("button:has-text('Start Production')");
console.log(`   start order: ${await toastText()}`);
await page.waitForTimeout(600);
await shot("order-started");
console.log("✅ Order started");

// ---------- 5. Record readings, advance stages ----------
// Complete first 4 stages to reach Moisture Adjustment (requires readings)
for (let i = 0; i < 4; i++) {
  await page.click("button:has-text('Done')");
  await page.waitForTimeout(500);
}
// Record a temperature + moisture reading on the active stage
await page.click("button:has-text('Reading')");
await page.waitForSelector("#rd-value");
await page.selectOption("#rd-param", "temperature");
await page.fill("#rd-value", "58");
await page.click("button:has-text('Record')");
console.log(`   temperature reading: ${await toastText()}`);
await page.waitForTimeout(400);
await page.click("button:has-text('Reading')");
await page.waitForSelector("#rd-value");
await page.selectOption("#rd-param", "moisture");
await page.fill("#rd-value", "45");
await page.click("button:has-text('Record')");
console.log(`   moisture reading: ${await toastText()}`);
await page.waitForTimeout(400);
await shot("order-readings");
console.log("✅ Stages advanced, readings recorded");

// ---------- 6. Complete order → batch ----------
await page.click("button:has-text('Complete Order')");
await page.waitForSelector("#co-qty");
await page.fill("#co-qty", "4.6");
await shot("complete-dialog");
await page.click("button:has-text('Complete & Create Batch')");
console.log(`   complete order: ${await toastText()}`);
await page.waitForTimeout(700);
await shot("order-completed");
console.log("✅ Order completed → batch created");

// ---------- 7. Batch traceability ----------
await page.goto(`${BASE}/batches`);
await shot("batches-list");
await page.click("table a >> nth=0");
await page.waitForSelector("text=Raw Material Traceability");
await shot("batch-traceability");
const batchTitle = await page.locator("h1").innerText();
console.log(`✅ Batch detail: ${batchTitle}`);

// ---------- 8. Dashboard + inventory reflect production ----------
await page.goto(`${BASE}/dashboard`);
await shot("dashboard-live");
await page.goto(`${BASE}/inventory`);
await shot("inventory-final");
await page.click("button:has-text('Ledger')");
await page.waitForTimeout(400);
await shot("ledger");
console.log("✅ Dashboard and ledger reflect production");

// ---------- 9. PROBE: over-issue must be blocked ----------
await page.goto(`${BASE}/production`);
await page.click("button:has-text('New Order')");
await page.waitForSelector("#po-qty");
await page.fill("#po-qty", "1000");
await page.selectOption("#po-supervisor", { label: "Production Supervisor" });
await page.click("button:has-text('Create Order')");
await page.waitForTimeout(500);
await page.click("table a >> nth=0");
await page.waitForSelector("button:has-text('Start Production')");
await page.click("button:has-text('Start Production')");
const overIssueToast = await toastText();
console.log(`🔍 over-issue probe (1000 ton): ${overIssueToast}`);
await shot("over-issue-blocked");

// ---------- 10. PROBE: supervisor cannot see Masters ----------
await page.goto(`${BASE}/login`);
// sign out first via the shell if still logged in
if (!page.url().includes("/login")) {
  await page.click("button:has-text('Sign out')");
  await page.waitForURL("**/login");
}
await page.fill("#username", "supervisor");
await page.fill("#password", "super123");
await page.click("button[type=submit]");
await page.waitForURL("**/dashboard", { timeout: 15000 });
const mastersVisible = await page.locator("nav >> text=Masters").count();
console.log(`🔍 supervisor nav shows Masters link: ${mastersVisible} (expect 0)`);
await page.goto(`${BASE}/masters`);
await page.waitForTimeout(600);
console.log(`🔍 supervisor direct /masters → landed on: ${page.url()} (expect /dashboard)`);
await shot("supervisor-view");

await browser.close();
console.log("\nDone. Screenshots in e2e-shots/");
