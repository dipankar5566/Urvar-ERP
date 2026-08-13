import { db, pool } from "./index";
import {
  users,
  products,
  items,
  warehouses,
  formulas,
  formulaLines,
  workflowTemplates,
  workflowTemplateStages,
} from "./schema";
import { hashPassword } from "../lib/password";

async function seed() {
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) {
    console.log("Database already seeded — skipping.");
    return;
  }

  console.log("Seeding Urvar ERP database...");

  // --- Users ---
  const [admin] = await db
    .insert(users)
    .values([
      {
        name: "Dipankar Chanda",
        username: "admin",
        passwordHash: await hashPassword("admin123"),
        role: "admin",
      },
      {
        name: "Production Supervisor",
        username: "supervisor",
        passwordHash: await hashPassword("super123"),
        role: "supervisor",
      },
    ])
    .returning();

  // --- Warehouse ---
  await db.insert(warehouses).values({ name: "Tantipara Plant", location: "West Bengal" });

  // --- Products ---
  const productRows = await db
    .insert(products)
    .values([
      { name: "Vermicompost", code: "VC", hsn: "3101", shelfLifeMonths: 24 },
      { name: "Enriched Vermicompost", code: "EVC", hsn: "3101", shelfLifeMonths: 24 },
      { name: "Potting Mix", code: "PM", hsn: "3101", shelfLifeMonths: 24 },
      { name: "Cow Dung Manure (FYM)", code: "FYM", hsn: "3101", shelfLifeMonths: 24 },
      { name: "PROM", code: "PROM", hsn: "3103", shelfLifeMonths: 24 },
      { name: "Organic Soil Conditioner", code: "OSC", hsn: "3101", shelfLifeMonths: 24 },
      { name: "Liquid Fertilizer", code: "LF", hsn: "3101", shelfLifeMonths: 12 },
      { name: "Micronutrient Mix", code: "MN", hsn: "3824", shelfLifeMonths: 24 },
    ])
    .returning();

  const vermicompost = productRows.find((p) => p.code === "VC")!;

  // --- Items ---
  const itemRows = await db
    .insert(items)
    .values([
      {
        name: "Cow Dung",
        category: "raw_material",
        uom: "ton",
        reorderLevel: 5,
        remarks: "Bought by tractor load (~2.5-3 ton, varies) — enter the actual weighed qty at Goods Receipt, note tractor count in Remarks/Vehicle No.",
      },
      { name: "Agricultural Waste", category: "raw_material", uom: "tractor", reorderLevel: 2 },
      { name: "Earthworm Culture", category: "raw_material", uom: "kg", reorderLevel: 50 },
      { name: "Rock Phosphate", category: "raw_material", uom: "ton", reorderLevel: 1 },
      { name: "Neem Cake", category: "raw_material", uom: "kg", reorderLevel: 100 },
      {
        name: "HDPE Bag 25kg",
        category: "packing_material",
        uom: "nos",
        reorderLevel: 500,
        remarks: "Min 1000 pcs per lot",
      },
      {
        name: "HDPE Bag 5kg",
        category: "packing_material",
        uom: "nos",
        reorderLevel: 500,
        remarks: "Min 1000 pcs per lot",
      },
      { name: "Labels & Thread", category: "consumable", uom: "roll", reorderLevel: 20 },
      { name: "Liner Bags", category: "packing_material", uom: "kg", reorderLevel: 50 },
      // Finished goods items (stock of produced goods)
      ...productRows.map((p) => ({
        name: p.name,
        category: "finished_good" as const,
        uom: (p.code === "LF" ? "litre" : "ton") as "litre" | "ton",
        productId: p.id,
        reorderLevel: 0,
      })),
    ])
    .returning();

  const cowDung = itemRows.find((i) => i.name === "Cow Dung")!;
  const agriWaste = itemRows.find((i) => i.name === "Agricultural Waste")!;
  const bags25 = itemRows.find((i) => i.name === "HDPE Bag 25kg")!;

  // --- Formula: Vermicompost 1 ton ---
  const [vcFormula] = await db
    .insert(formulas)
    .values({
      name: "Vermicompost Standard (per ton)",
      productId: vermicompost.id,
      outputQty: 1,
      outputUom: "ton",
    })
    .returning();

  await db.insert(formulaLines).values([
    { formulaId: vcFormula.id, itemId: cowDung.id, qtyPerOutput: 1.6 },
    { formulaId: vcFormula.id, itemId: agriWaste.id, qtyPerOutput: 0.4 },
    { formulaId: vcFormula.id, itemId: bags25.id, qtyPerOutput: 40 },
  ]);

  // --- Vermicompost workflow template ---
  const [vcTemplate] = await db
    .insert(workflowTemplates)
    .values({ name: "Vermicompost Manufacturing", productId: vermicompost.id })
    .returning();

  const stages: { name: string; expectedDays?: number; requiresReadings?: boolean }[] = [
    { name: "Raw Material Received" },
    { name: "Segregation", expectedDays: 1 },
    { name: "Pre-processing", expectedDays: 2 },
    { name: "Windrow Formation", expectedDays: 1 },
    { name: "Moisture Adjustment", expectedDays: 1, requiresReadings: true },
    { name: "Composting", expectedDays: 30, requiresReadings: true },
    { name: "Turning Schedule", expectedDays: 15, requiresReadings: true },
    { name: "Temperature Monitoring", expectedDays: 15, requiresReadings: true },
    { name: "Curing", expectedDays: 10, requiresReadings: true },
    { name: "Screening", expectedDays: 2 },
    { name: "Enrichment", expectedDays: 1 },
    { name: "Mixing", expectedDays: 1 },
    { name: "Quality Testing", expectedDays: 2 },
    { name: "Packaging", expectedDays: 2 },
    { name: "Finished Goods", expectedDays: 1 },
    { name: "Warehouse" },
  ];

  await db.insert(workflowTemplateStages).values(
    stages.map((s, i) => ({
      templateId: vcTemplate.id,
      seq: i + 1,
      name: s.name,
      expectedDays: s.expectedDays ?? null,
      requiresReadings: s.requiresReadings ?? false,
    }))
  );

  console.log("Seed complete.");
  console.log("Login — admin / admin123, supervisor / super123");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
