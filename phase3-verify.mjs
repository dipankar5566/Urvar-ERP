import { chromium } from "playwright";
import path from "path";

const BASE = "http://localhost:3001";
const SHOTS = "/Users/dipankarchanda/Urvar/Production/urvar-erp/e2e-shots";

async function login(page, username, password) {
  await page.goto(`${BASE}/login`);
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/dashboard/);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `p3-${name}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  // ---- Step 5 setup: create a zone under Machine Shed & Godown ----
  await login(page, "admin", "admin123");
  await page.goto(`${BASE}/masters`);
  await page.click("button:has-text('Warehouses')");
  await page.waitForTimeout(300);
  const row = page.locator("tr", { has: page.locator("text=Machine Shed & Godown") });
  const addZoneBtn = row.locator("button:has-text('Zone')");
  await addZoneBtn.waitFor({ state: "visible", timeout: 5000 });
  await addZoneBtn.click();
  await page.waitForSelector("[role=dialog]");
  await shot(page, "01-zone-dialog-open");
  // fill form inside dialog (warehouseId is a fixed hidden field on this row's dialog)
  const dialog = page.locator("[role=dialog]");
  await dialog.locator("input[name=name]").fill("Rack A");
  await dialog.locator("input[name=code]").fill("RA");
  await dialog.locator("button[type=submit]").click();
  await page.waitForTimeout(800);
  await shot(page, "02-zone-created");

  // ---- Step 1: Transfer 1 ton Cow Dung Kisanbandhu -> Machine Shed & Godown ----
  await page.goto(`${BASE}/inventory`);
  await page.waitForTimeout(300);
  await page.click("button:has-text('Transfer')");
  await page.waitForSelector("[role=dialog]");
  const trfDialog = page.locator("[role=dialog]");
  await trfDialog.locator("#trf-item").selectOption({ label: "Cow Dung (ton)" });
  await trfDialog.locator("#trf-from").selectOption({ label: "Kisanbandhu Plant" });
  await trfDialog.locator("#trf-to").selectOption({ label: "Machine Shed & Godown" });
  await page.waitForTimeout(200);
  // to-zone select should now show Rack A as optional
  const toZoneVisible = await trfDialog.locator("#trf-to-zone").isVisible().catch(() => false);
  await trfDialog.locator("#trf-qty").fill("1");
  await trfDialog.locator("#trf-remarks").fill("Phase 3 verification transfer");
  await shot(page, "03-transfer-dialog-filled");
  await trfDialog.locator("button[type=submit]:has-text('Transfer')").click();
  await page.waitForTimeout(1000);
  await shot(page, "04-after-transfer");
  console.log("to-zone select visible during transfer dialog:", toZoneVisible);

  // ---- Step 2: Transfer a hold-status batch (batch 3, Vermicompost) ----
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Transfer')");
  await page.waitForSelector("[role=dialog]");
  const trf2 = page.locator("[role=dialog]");
  await trf2.locator("#trf-item").selectOption({ label: "Vermicompost (ton)" });
  await page.waitForTimeout(200);
  await trf2.locator("#trf-from").selectOption({ label: "Kisanbandhu Plant" });
  await trf2.locator("#trf-to").selectOption({ label: "Machine Shed & Godown" });
  await page.waitForTimeout(200);
  const batchOptions = await trf2.locator("#trf-batch option").allTextContents();
  console.log("Transfer batch options:", batchOptions);
  const holdOpt = batchOptions.find((o) => o.startsWith("UV-VC-260708-02"));
  await trf2.locator("#trf-batch").selectOption({ label: holdOpt });
  await trf2.locator("#trf-qty").fill("0.5");
  await trf2.locator("#trf-remarks").fill("Transfer of held batch - verify not QC-gated");
  await shot(page, "05-transfer-held-batch-dialog");
  await trf2.locator("button[type=submit]:has-text('Transfer')").click();
  await page.waitForTimeout(1000);
  await shot(page, "06-after-held-batch-transfer");

  // ---- Step 2b: negative adjustment against same held batch at new warehouse -> should be blocked ----
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Adjustment')");
  await page.waitForSelector("[role=dialog]");
  const adjDialog = page.locator("[role=dialog]");
  await adjDialog.locator("#adj-item").selectOption({ label: "Vermicompost (ton)" });
  await adjDialog.locator("#adj-wh").selectOption({ label: "Machine Shed & Godown" });
  await page.waitForTimeout(200);
  const adjBatchOptions = await adjDialog.locator("#adj-batch option").allTextContents();
  console.log("Adjustment batch options at Machine Shed & Godown:", adjBatchOptions);
  const heldAtDest = adjBatchOptions.find((o) => o.startsWith("UV-VC-260708-02"));
  await adjDialog.locator("#adj-batch").selectOption({ label: heldAtDest });
  await adjDialog.locator("#adj-qty").fill("-0.1");
  await adjDialog.locator("#adj-reason").fill("Testing dispatch gate after transfer");
  await shot(page, "07-adjustment-held-batch-dialog");
  await adjDialog.locator("button[type=submit]:has-text('Adjust')").click();
  await page.waitForTimeout(1000);
  await shot(page, "08-adjustment-blocked-result");
  const stillOpen = await page.locator("[role=dialog]").isVisible().catch(() => false);
  console.log("Adjustment dialog still open (expected true = blocked):", stillOpen);
  if (stillOpen) {
    const errText = await page.locator("[role=dialog]").innerText();
    console.log("Dialog content on block:", errText.slice(0, 400));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // ---- Step 3: same-warehouse transfer rejected ----
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Transfer')");
  await page.waitForSelector("[role=dialog]");
  const trf3 = page.locator("[role=dialog]");
  await trf3.locator("#trf-item").selectOption({ label: "Cow Dung (ton)" });
  await trf3.locator("#trf-from").selectOption({ label: "Kisanbandhu Plant" });
  await trf3.locator("#trf-to").selectOption({ label: "Kisanbandhu Plant" });
  await trf3.locator("#trf-qty").fill("1");
  await shot(page, "09-same-warehouse-transfer-dialog");
  await trf3.locator("button[type=submit]:has-text('Transfer')").click();
  await page.waitForTimeout(800);
  const sameWhStillOpen = await page.locator("[role=dialog]").isVisible().catch(() => false);
  console.log("Same-warehouse transfer dialog still open (expected true = rejected):", sameWhStillOpen);
  if (sameWhStillOpen) {
    const errText = await page.locator("[role=dialog]").innerText();
    console.log("Same-wh error content:", errText.slice(0, 400));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  await shot(page, "10-same-warehouse-rejected");

  // ---- Step 4 + 6: Expiry tab and Aging tab ----
  await page.goto(`${BASE}/inventory`);
  await page.waitForTimeout(300);
  await page.click("button:has-text('Expiry')");
  await page.waitForTimeout(300);
  await shot(page, "11-expiry-tab");
  const expiryText = await page.locator("body").innerText();
  console.log("Expiry tab contains UV-VC-260707-01 (expired):", expiryText.includes("UV-VC-260707-01"));
  console.log("Expiry tab contains UV-VC-260708-01 (near-expiry):", expiryText.includes("UV-VC-260708-01"));
  console.log("Expiry tab contains UV-VC-260708-02 (far future, should NOT appear):", expiryText.includes("UV-VC-260708-02"));

  await page.click("button:has-text('Aging')");
  await page.waitForTimeout(300);
  await shot(page, "12-aging-tab");
  const agingText = await page.locator("body").innerText();
  console.log("Aging tab loaded, contains 'Fresh' bucket:", agingText.includes("Fresh"));

  // ---- Step 5b: Goods receipt with zone selected + one without ----
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Goods Receipt')");
  await page.waitForSelector("[role=dialog]");
  const grDialog = page.locator("[role=dialog]");
  await grDialog.locator("#gr-item").selectOption({ label: "Neem Cake (kg)" });
  await grDialog.locator("#gr-qty").fill("500");
  await grDialog.locator("#gr-wh").selectOption({ label: "Machine Shed & Godown" });
  await page.waitForTimeout(200);
  const zoneSelectVisible = await grDialog.locator("#gr-zone").isVisible().catch(() => false);
  console.log("GR zone select visible for Machine Shed & Godown (has zone):", zoneSelectVisible);
  if (zoneSelectVisible) {
    await grDialog.locator("#gr-zone").selectOption({ label: "Rack A" });
  }
  await grDialog.locator("#gr-supplier").fill("Test Supplier Co");
  await shot(page, "13-gr-with-zone");
  await grDialog.locator("button[type=submit]:has-text('Receive')").click();
  await page.waitForTimeout(1000);
  await shot(page, "14-gr-with-zone-done");

  // GR without zone (Kisanbandhu Plant has no zones set up)
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Goods Receipt')");
  await page.waitForSelector("[role=dialog]");
  const grDialog2 = page.locator("[role=dialog]");
  await grDialog2.locator("#gr-item").selectOption({ label: "Rock Phosphate (ton)" });
  await grDialog2.locator("#gr-qty").fill("2");
  await grDialog2.locator("#gr-wh").selectOption({ label: "Kisanbandhu Plant" });
  await page.waitForTimeout(200);
  const zoneSelectVisible2 = await grDialog2.locator("#gr-zone").isVisible().catch(() => false);
  console.log("GR zone select visible for Kisanbandhu Plant (no zones):", zoneSelectVisible2);
  await grDialog2.locator("#gr-supplier").fill("Another Supplier");
  await grDialog2.locator("button[type=submit]:has-text('Receive')").click();
  await page.waitForTimeout(1000);
  await shot(page, "15-gr-no-zone-done");

  // ---- Dashboard Stock Alerts card ----
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(300);
  await shot(page, "16-dashboard-stock-alerts");
  const dashText = await page.locator("body").innerText();
  console.log("Dashboard shows 'Stock Alerts':", dashText.includes("Stock Alerts"));
  console.log("Dashboard shows expired batch UV-VC-260707-01:", dashText.includes("UV-VC-260707-01"));
  console.log("Dashboard shows near-expiry batch UV-VC-260708-01:", dashText.includes("UV-VC-260708-01"));

  await browser.close();
  console.log("DONE");
})().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
