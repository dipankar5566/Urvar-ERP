import { chromium } from "playwright";
import fs from "fs";

const BASE = "http://localhost:3001";
fs.mkdirSync("e2e-shots", { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

let shotN = 0;
async function shot(name) {
  shotN++;
  await page.screenshot({ path: `e2e-shots/${String(shotN).padStart(2, "0")}-${name}.png` });
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

// Wait until no dialog overlay is present (dialog fully closed)
async function waitDialogClosed() {
  await page.waitForSelector("[data-slot=dialog-overlay]", { state: "detached", timeout: 8000 }).catch(() => {});
}

// ---------- Login ----------
await page.goto(`${BASE}/login`);
await page.fill("#username", "admin");
await page.fill("#password", "admin123");
await page.click("button[type=submit]");
await page.waitForURL("**/dashboard", { timeout: 15000 });
console.log("✅ logged in");

// ---------- 1. Layout map renders 25 beds, all empty ----------
await page.goto(`${BASE}/layout-map`);
await page.waitForSelector("svg[aria-label='Site layout with vermicompost beds']");
const bedCount = await page.locator("svg g[role=button]").count();
console.log(`beds rendered: ${bedCount} (expect 25)`);
let summary = await page.locator("p", { hasText: "occupied" }).first().innerText();
console.log(`initial occupancy: ${summary.match(/\(\d+ occupied\)/)?.[0]} (expect 0 occupied)`);
await shot("layout-empty");

// ---------- 2. Click a bed → detail panel shows Empty ----------
await page.locator("svg g[role=button]").first().click();
await page.waitForTimeout(300);
console.log(`clicked bed panel title: ${await page.locator("h2").first().innerText()}`);
console.log(`clicked bed status: ${await page.locator("h2 + * , h2").locator("..").locator("[class*=badge], span").allInnerTexts().catch(() => "n/a")}`);
await shot("layout-bed-selected");

// ---------- 3. Goods receipts so orders can actually start ----------
async function goodsReceipt(itemLabelPart, qty, supplier) {
  await page.goto(`${BASE}/inventory`);
  await page.click("button:has-text('Goods Receipt')");
  await page.waitForSelector("#gr-item");
  await page.selectOption("#gr-item", { label: itemLabelPart });
  await page.fill("#gr-qty", String(qty));
  await page.fill("#gr-supplier", supplier);
  await page.click("button:has-text('Receive')");
  console.log(`   receipt ${itemLabelPart} x${qty}: ${await toastText()}`);
  await waitDialogClosed();
  await page.waitForTimeout(300);
}
await goodsReceipt("Cow Dung (ton)", 20, "Ghosh Dairy Farm");
await goodsReceipt("Agricultural Waste (tractor)", 8, "Local Farmers Co-op");
await goodsReceipt("HDPE Bag 25kg (nos)", 1000, "Kolkata Packaging Co");

// ---------- 4. Create a small order, assign Z2-01 + Z2-02, start it ----------
await page.goto(`${BASE}/production`);
await page.click("button:has-text('New Order')");
await page.waitForSelector("#po-qty");
await page.selectOption("#po-product", { label: "Vermicompost" });
await page.waitForFunction(
  () => document.querySelector("#po-formula")?.options.length > 0 &&
        document.querySelector("#po-formula")?.value !== ""
);
await page.fill("#po-qty", "2");
await page.selectOption("#po-supervisor", { label: "Production Supervisor" });
await page.click("button:has-text('Create Order')");
console.log(`create order: ${await toastText()}`);
await waitDialogClosed();
await page.waitForTimeout(500);

await page.click("table a >> nth=0");
await page.waitForSelector("button:has-text('Assign')");
await page.click("button:has-text('Assign')");
await page.waitForSelector("text=Assign Beds");
await page.click("button:has-text('Z2-01')");
await page.click("button:has-text('Z2-02')");
await shot("assign-dialog-picking");
await page.click("button:has-text('Save Assignment')");
console.log(`assign beds: ${await toastText()}`);
await waitDialogClosed();
await page.waitForTimeout(500);

const orderUrl = page.url();
const badgeTexts = await page.locator("span.font-mono").allInnerTexts();
console.log(`order page shows bed badges: ${JSON.stringify(badgeTexts)}`);
await shot("order-beds-assigned");

await page.click("button:has-text('Start Production')");
console.log(`start order: ${await toastText()}`);
await page.waitForTimeout(700);
await shot("order-started-with-beds");

// ---------- 4. Layout map now shows 2 occupied ----------
await page.goto(`${BASE}/layout-map`);
await page.waitForSelector("svg");
summary = await page.locator("p", { hasText: "occupied" }).first().innerText();
console.log(`after start: ${summary.match(/\(\d+ occupied\)/)?.[0]} (expect 2 occupied)`);
await shot("layout-2-occupied");

// Click the occupied Z2-01 chip in the zone-2 card (second Card's chip "01")
const z2Card = page.locator("div", { hasText: "Zone 2" }).locator("..").last();
await page.locator("button:has-text('01')").last().click();
await page.waitForTimeout(300);
console.log(`occupied bed panel: ${await page.locator("h2").first().innerText()}`);
const occupantInfo = await page.locator("a[href^='/production/']").first().innerText().catch(() => "(no order link found)");
console.log(`occupant order link text: ${occupantInfo}`);
await shot("layout-occupied-detail");

// ---------- 5. PROBE: occupied bed disabled when assigning to a different order ----------
await page.goto(`${BASE}/production`);
await page.click("button:has-text('New Order')");
await page.waitForSelector("#po-qty");
await page.selectOption("#po-product", { label: "Vermicompost" });
await page.waitForFunction(
  () => document.querySelector("#po-formula")?.options.length > 0 &&
        document.querySelector("#po-formula")?.value !== ""
);
await page.fill("#po-qty", "1");
await page.selectOption("#po-supervisor", { label: "Production Supervisor" });
await page.click("button:has-text('Create Order')");
console.log(`create 2nd order: ${await toastText()}`);
await waitDialogClosed();
await page.waitForTimeout(500);

await page.click("table a >> nth=0");
await page.waitForSelector("button:has-text('Assign')");
await page.click("button:has-text('Assign')");
await page.waitForSelector("text=Assign Beds");
const z201btn = page.locator("button:has-text('Z2-01')");
const disabled = await z201btn.isDisabled();
console.log(`🔍 occupied bed Z2-01 disabled in a different order's picker: ${disabled} (expect true)`);
await shot("probe-occupied-bed-disabled");

// try clicking it anyway (should no-op since disabled) then pick a free bed and save
await page.click("button:has-text('Z1-05')");
await page.click("button:has-text('Save Assignment')");
console.log(`assign free bed to 2nd order: ${await toastText()}`);
await waitDialogClosed();

console.log("\npage errors:", pageErrors.length ? pageErrors : "none");
await browser.close();
console.log("done");
