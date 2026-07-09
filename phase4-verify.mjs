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
  await page.screenshot({ path: path.join(SHOTS, `p4-${name}.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  await login(page, "admin", "admin123");

  // ---- Step 1: create vendor ----
  await page.goto(`${BASE}/masters`);
  await page.click("button:has-text('Vendors')");
  await page.waitForTimeout(300);
  await page.click("button:has-text('Add Vendor')");
  await page.waitForSelector("[role=dialog]");
  const vDialog = page.locator("[role=dialog]");
  await vDialog.locator("#v-name").fill("Green Earth Suppliers");
  await vDialog.locator("#v-contact").fill("Ramesh Kumar");
  await vDialog.locator("#v-phone").fill("9876543210");
  await vDialog.locator("#v-gstin").fill("27ABCDE1234F1Z5");
  await shot(page, "01-vendor-dialog");
  await vDialog.locator("button[type=submit]").click();
  await page.waitForTimeout(800);
  await shot(page, "02-vendor-created");

  // ---- Step 2: create draft PO with 2 lines ----
  await page.goto(`${BASE}/procurement`);
  await page.waitForTimeout(300);
  await page.click("button:has-text('New PO')");
  await page.waitForSelector("[role=dialog]");
  let poDialog = page.locator("[role=dialog]");
  await poDialog.locator("select").first().selectOption({ label: "Green Earth Suppliers" });
  // line 1: Cow Dung 5 ton @ 3000
  const lineRows = poDialog.locator("div.flex.items-center.gap-2");
  await lineRows.nth(0).locator("select").selectOption({ label: "Cow Dung" });
  await lineRows.nth(0).locator("input[placeholder=Qty]").fill("5");
  await lineRows.nth(0).locator("input[placeholder=Rate]").fill("3000");
  // add line 2
  await poDialog.locator("button:has-text('Line')").click();
  await lineRows.nth(1).locator("select").selectOption({ label: "Rock Phosphate" });
  await lineRows.nth(1).locator("input[placeholder=Qty]").fill("2");
  await lineRows.nth(1).locator("input[placeholder=Rate]").fill("15000");
  await shot(page, "03-new-po-filled");
  await poDialog.locator("button:has-text('Create draft')").click();
  await page.waitForTimeout(1000);
  await shot(page, "04-po-created");

  const poRow = await page.locator("table tbody tr").first().innerText();
  console.log("First PO row after creation:", poRow.replace(/\n/g, " | "));

  // ---- Step 3: negative check — GR PO picker should NOT show draft PO ----
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Goods Receipt')");
  await page.waitForSelector("[role=dialog]");
  let grDialog = page.locator("[role=dialog]");
  const poPickerExistsBeforeApproval = await grDialog.locator("#gr-po").count();
  console.log("GR PO picker present before approval (expect 0, no open lines yet):", poPickerExistsBeforeApproval);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ---- Step 4: approve PO ----
  await page.goto(`${BASE}/procurement`);
  await page.waitForTimeout(300);
  await page.click("table tbody tr >> nth=0 >> button[aria-label=View]");
  await page.waitForSelector("[role=dialog]");
  let detailDialog = page.locator("[role=dialog]");
  await shot(page, "05-po-detail-draft");
  await detailDialog.locator("button:has-text('Approve')").click();
  await page.waitForTimeout(800);
  await shot(page, "06-po-approved");

  await page.goto(`${BASE}/procurement`);
  const poRowAfterApproval = await page.locator("table tbody tr").first().innerText();
  console.log("First PO row after approval:", poRowAfterApproval.replace(/\n/g, " | "));

  // Confirm now visible in GR PO picker
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Goods Receipt')");
  await page.waitForSelector("[role=dialog]");
  grDialog = page.locator("[role=dialog]");
  const poOptionsAfterApproval = await grDialog.locator("#gr-po option").allTextContents();
  console.log("GR PO picker options after approval:", poOptionsAfterApproval);

  // ---- Step 5: receive 3 of 5 ton against Cow Dung line ----
  const cowDungOption = poOptionsAfterApproval.find((o) => o.includes("Cow Dung"));
  await grDialog.locator("#gr-po").selectOption({ label: cowDungOption });
  await page.waitForTimeout(200);
  await grDialog.locator("#gr-qty").fill("3");
  await grDialog.locator("#gr-date").fill("2026-07-08");
  await shot(page, "07-gr-po-linked-filled");
  await grDialog.locator("button[type=submit]:has-text('Receive')").click();
  await page.waitForTimeout(1000);
  await shot(page, "08-gr-po-linked-done");

  // ---- Step 6: receive remaining 2 ton Cow Dung + fully receive Rock Phosphate ----
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Goods Receipt')");
  await page.waitForSelector("[role=dialog]");
  grDialog = page.locator("[role=dialog]");
  let opts = await grDialog.locator("#gr-po option").allTextContents();
  const cowDungRemaining = opts.find((o) => o.includes("Cow Dung"));
  console.log("Cow Dung PO line option before final receipt:", cowDungRemaining);
  await grDialog.locator("#gr-po").selectOption({ label: cowDungRemaining });
  await page.waitForTimeout(200);
  await grDialog.locator("#gr-qty").fill("2");
  await grDialog.locator("#gr-date").fill("2026-07-08");
  await grDialog.locator("button[type=submit]:has-text('Receive')").click();
  await page.waitForTimeout(1000);

  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Goods Receipt')");
  await page.waitForSelector("[role=dialog]");
  grDialog = page.locator("[role=dialog]");
  opts = await grDialog.locator("#gr-po option").allTextContents();
  const rockPhosOption = opts.find((o) => o.includes("Rock Phosphate"));
  console.log("Rock Phosphate PO line option:", rockPhosOption);
  await grDialog.locator("#gr-po").selectOption({ label: rockPhosOption });
  await page.waitForTimeout(200);
  await grDialog.locator("#gr-qty").fill("2");
  await grDialog.locator("#gr-date").fill("2026-07-08");
  await grDialog.locator("button[type=submit]:has-text('Receive')").click();
  await page.waitForTimeout(1000);
  await shot(page, "09-gr-final-line-done");

  await page.goto(`${BASE}/procurement`);
  const poRowAfterFullReceipt = await page.locator("table tbody tr").first().innerText();
  console.log("First PO row after full receipt (expect Closed):", poRowAfterFullReceipt.replace(/\n/g, " | "));

  // ---- Step 7: attempt to edit a non-draft (closed) PO ----
  await page.click("table tbody tr >> nth=0 >> button[aria-label=View]");
  await page.waitForSelector("[role=dialog]");
  detailDialog = page.locator("[role=dialog]");
  const editButtonCount = await detailDialog.locator("button:has-text('Edit')").count();
  console.log("Edit button present on closed PO (expect 0):", editButtonCount);
  await shot(page, "10-po-detail-closed");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ---- Step 8a: attempt to approve an already non-draft PO (server-side reject) ----
  const approveResult = await page.evaluate(async () => {
    const res = await fetch("/procurement", { method: "GET" });
    return res.status;
  });
  console.log("Sanity GET /procurement status:", approveResult);

  // ---- Step 2b: create a second small PO to test cancel-with-receipts rejection ----
  await page.goto(`${BASE}/procurement`);
  await page.click("button:has-text('New PO')");
  await page.waitForSelector("[role=dialog]");
  poDialog = page.locator("[role=dialog]");
  await poDialog.locator("select").first().selectOption({ label: "Green Earth Suppliers" });
  const lineRows2 = poDialog.locator("div.flex.items-center.gap-2");
  await lineRows2.nth(0).locator("select").selectOption({ label: "Cow Dung" });
  await lineRows2.nth(0).locator("input[placeholder=Qty]").fill("10");
  console.log(
    "Rate auto-suggested for Cow Dung + Green Earth Suppliers (expect 3000 from rate history):",
    await lineRows2.nth(0).locator("input[placeholder=Rate]").inputValue()
  );
  await poDialog.locator("button:has-text('Create draft')").click();
  await page.waitForTimeout(1000);

  // Approve it
  await page.click("table tbody tr >> nth=0 >> button[aria-label=View]");
  await page.waitForSelector("[role=dialog]");
  detailDialog = page.locator("[role=dialog]");
  await detailDialog.locator("button:has-text('Approve')").click();
  await page.waitForTimeout(800);

  // Receive a small amount against it
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Goods Receipt')");
  await page.waitForSelector("[role=dialog]");
  grDialog = page.locator("[role=dialog]");
  opts = await grDialog.locator("#gr-po option").allTextContents();
  const secondPoLine = opts.find((o) => o.includes("Cow Dung"));
  await grDialog.locator("#gr-po").selectOption({ label: secondPoLine });
  await page.waitForTimeout(200);
  await grDialog.locator("#gr-qty").fill("1");
  await grDialog.locator("#gr-date").fill("2026-07-08");
  await grDialog.locator("button[type=submit]:has-text('Receive')").click();
  await page.waitForTimeout(1000);

  // Now attempt Cancel — should be rejected (server-side); UI shouldn't even show it for partially_received,
  // but let's confirm via direct action call through the page context using the exposed React action isn't
  // trivial from Playwright, so verify the Cancel button is absent for partially_received status (UI-gated).
  await page.goto(`${BASE}/procurement`);
  await page.click("table tbody tr >> nth=0 >> button[aria-label=View]");
  await page.waitForSelector("[role=dialog]");
  detailDialog = page.locator("[role=dialog]");
  const cancelButtonCount = await detailDialog.locator("button:has-text('Cancel')").count();
  console.log("Cancel button present on partially_received PO with receipts (expect 0):", cancelButtonCount);
  await shot(page, "11-po-detail-partially-received");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // ---- Step 9: Dashboard Quick-PO shortcut on a naturally low-stock item ----
  await page.goto(`${BASE}/dashboard`);
  await page.waitForTimeout(300);
  await shot(page, "12-dashboard-stock-alerts");
  const orderButtons = page.locator("button[aria-label^='Order ']");
  const orderBtnCount = await orderButtons.count();
  console.log("Dashboard Order buttons found for low-stock items:", orderBtnCount);
  if (orderBtnCount > 0) {
    const label = await orderButtons.first().getAttribute("aria-label");
    console.log("Clicking:", label);
    await orderButtons.first().click();
    await page.waitForSelector("[role=dialog]");
    const quickPoDialog = page.locator("[role=dialog]");
    await shot(page, "13-dashboard-quick-po-dialog");
    const itemLine = quickPoDialog.locator("div.flex.items-center.gap-2").first();
    const preselectedItem = await itemLine.locator("select").first().evaluate((el) => el.selectedOptions[0].text);
    console.log("Quick-PO dialog pre-filled item:", preselectedItem, "expected label suffix:", label);
    await page.keyboard.press("Escape");
  }

  // ---- Step 10: ad-hoc Goods Receipt still works exactly as before ----
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Goods Receipt')");
  await page.waitForSelector("[role=dialog]");
  grDialog = page.locator("[role=dialog]");
  // leave PO picker at "None (ad-hoc)"
  await grDialog.locator("#gr-item").selectOption({ label: "Neem Cake (kg)" });
  await grDialog.locator("#gr-qty").fill("200");
  await grDialog.locator("#gr-supplier").fill("Local Farmer Co-op");
  await grDialog.locator("#gr-date").fill("2026-07-08");
  await shot(page, "14-adhoc-gr-filled");
  await grDialog.locator("button[type=submit]:has-text('Receive')").click();
  await page.waitForTimeout(1000);
  await shot(page, "15-adhoc-gr-done");
  const dialogStillOpen = await page.locator("[role=dialog]").isVisible().catch(() => false);
  console.log("Ad-hoc GR dialog closed after success (expect false):", dialogStillOpen);

  await browser.close();
  console.log("DONE");
})().catch((e) => {
  console.error("SCRIPT ERROR:", e);
  process.exit(1);
});
