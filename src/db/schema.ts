import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ---------- Masters ----------

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "supervisor"] }).notNull().default("supervisor"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(), // short code used in batch numbers, e.g. VC, EVC, PM
  hsn: text("hsn"),
  shelfLifeMonths: integer("shelf_life_months").notNull().default(12),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  category: text("category", {
    enum: ["raw_material", "packing_material", "finished_good", "consumable", "scrap"],
  }).notNull(),
  uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos"] }).notNull(),
  // finished_good items link back to a product (one item per product, stock kept in product's base uom)
  productId: integer("product_id").references(() => products.id),
  reorderLevel: real("reorder_level").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const warehouses = sqliteTable("warehouses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  location: text("location"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const formulas = sqliteTable("formulas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  productId: integer("product_id").notNull().references(() => products.id),
  outputQty: real("output_qty").notNull(), // e.g. 1
  outputUom: text("output_uom", { enum: ["kg", "ton", "bag", "litre", "nos"] }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const formulaLines = sqliteTable("formula_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  formulaId: integer("formula_id").notNull().references(() => formulas.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => items.id),
  qtyPerOutput: real("qty_per_output").notNull(), // qty of item consumed per outputQty of product
});

export const workflowTemplates = sqliteTable("workflow_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  productId: integer("product_id").references(() => products.id), // optional default template for a product
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const workflowTemplateStages = sqliteTable(
  "workflow_template_stages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    templateId: integer("template_id")
      .notNull()
      .references(() => workflowTemplates.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    name: text("name").notNull(),
    expectedDays: integer("expected_days"),
    requiresReadings: integer("requires_readings", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [uniqueIndex("wts_template_seq").on(t.templateId, t.seq)]
);

// ---------- Zones & Beds (site layout) ----------

export const zones = sqliteTable("zones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(), // Z1, Z2
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const beds = sqliteTable(
  "beds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    zoneId: integer("zone_id").notNull().references(() => zones.id),
    code: text("code").notNull().unique(), // Z1-01 … Z2-15
    lengthFt: real("length_ft").notNull(),
    widthFt: real("width_ft").notNull(),
    // Bed top-left corner on the site plan, in feet (y increases northward).
    posX: real("pos_x").notNull(),
    posY: real("pos_y").notNull(),
    orientation: text("orientation", { enum: ["h", "v"] }).notNull(), // h: length runs E-W
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("beds_zone").on(t.zoneId)]
);

// ---------- Production ----------

export const productionOrders = sqliteTable("production_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNo: text("order_no").notNull().unique(), // PO-YYMM-###
  productId: integer("product_id").notNull().references(() => products.id),
  formulaId: integer("formula_id").notNull().references(() => formulas.id),
  templateId: integer("template_id").notNull().references(() => workflowTemplates.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  targetQty: real("target_qty").notNull(),
  uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos"] }).notNull(),
  supervisorId: integer("supervisor_id").notNull().references(() => users.id),
  shift: text("shift", { enum: ["day", "night", "general"] }).notNull().default("general"),
  plannedStart: text("planned_start"),
  plannedEnd: text("planned_end"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  status: text("status", { enum: ["draft", "in_progress", "completed", "cancelled"] })
    .notNull()
    .default("draft"),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const orderStages = sqliteTable(
  "order_stages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => productionOrders.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    name: text("name").notNull(),
    requiresReadings: integer("requires_readings", { mode: "boolean" }).notNull().default(false),
    status: text("status", { enum: ["pending", "in_progress", "completed", "skipped"] })
      .notNull()
      .default("pending"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    doneBy: integer("done_by").references(() => users.id),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("os_order_seq").on(t.orderId, t.seq)]
);

export const stageReadings = sqliteTable(
  "stage_readings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderStageId: integer("order_stage_id")
      .notNull()
      .references(() => orderStages.id, { onDelete: "cascade" }),
    parameter: text("parameter", {
      enum: ["temperature", "moisture", "ph", "turning", "other"],
    }).notNull(),
    value: real("value").notNull(),
    unit: text("unit"), // °C, %, pH, count
    notes: text("notes"),
    recordedBy: integer("recorded_by").notNull().references(() => users.id),
    recordedAt: text("recorded_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index("sr_stage").on(t.orderStageId)]
);

// Which beds a production order occupies. A bed is "occupied" while its
// order is in_progress; completing or cancelling the order frees it.
export const orderBeds = sqliteTable(
  "order_beds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => productionOrders.id, { onDelete: "cascade" }),
    bedId: integer("bed_id").notNull().references(() => beds.id),
  },
  (t) => [uniqueIndex("ob_order_bed").on(t.orderId, t.bedId), index("ob_bed").on(t.bedId)]
);

// ---------- Traceability ----------

export const lots = sqliteTable("lots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotNo: text("lot_no").notNull().unique(), // LOT-YYMM-###
  itemId: integer("item_id").notNull().references(() => items.id),
  supplierName: text("supplier_name").notNull(),
  receivedQty: real("received_qty").notNull(),
  uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos"] }).notNull(),
  receivedDate: text("received_date").notNull(),
  vehicleNo: text("vehicle_no"),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const batches = sqliteTable("batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchNo: text("batch_no").notNull().unique(), // UV-{CODE}-{YYMMDD}-##
  orderId: integer("order_id").notNull().references(() => productionOrders.id),
  productId: integer("product_id").notNull().references(() => products.id),
  mfgDate: text("mfg_date").notNull(),
  expiryDate: text("expiry_date").notNull(),
  qtyProduced: real("qty_produced").notNull(),
  uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos"] }).notNull(),
  expectedQty: real("expected_qty").notNull(),
  yieldPct: real("yield_pct").notNull(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  qcStatus: text("qc_status", { enum: ["pending", "released", "hold"] })
    .notNull()
    .default("pending"),
  dispatchStatus: text("dispatch_status", { enum: ["in_stock", "partial", "dispatched"] })
    .notNull()
    .default("in_stock"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const batchInputs = sqliteTable(
  "batch_inputs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    batchId: integer("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    lotId: integer("lot_id").notNull().references(() => lots.id),
    itemId: integer("item_id").notNull().references(() => items.id),
    qtyConsumed: real("qty_consumed").notNull(),
    uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos"] }).notNull(),
  },
  (t) => [index("bi_batch").on(t.batchId), index("bi_lot").on(t.lotId)]
);

// ---------- Inventory ----------

export const inventoryTransactions = sqliteTable(
  "inventory_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", {
      enum: [
        "goods_receipt",
        "issue_to_production",
        "production_output",
        "adjustment",
      ],
    }).notNull(),
    itemId: integer("item_id").notNull().references(() => items.id),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    lotId: integer("lot_id").references(() => lots.id),
    batchId: integer("batch_id").references(() => batches.id),
    qty: real("qty").notNull(), // signed: + in, - out
    uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos"] }).notNull(),
    refType: text("ref_type"), // e.g. "production_order", "lot", "manual"
    refId: integer("ref_id"),
    reason: text("reason"), // required for adjustments
    createdBy: integer("created_by").notNull().references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    index("it_item_wh").on(t.itemId, t.warehouseId),
    index("it_type").on(t.type),
    index("it_created").on(t.createdAt),
  ]
);

export const stockBalances = sqliteTable(
  "stock_balances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id").notNull().references(() => items.id),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    lotId: integer("lot_id").references(() => lots.id),
    batchId: integer("batch_id").references(() => batches.id),
    qty: real("qty").notNull().default(0),
    uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos"] }).notNull(),
  },
  (t) => [
    uniqueIndex("sb_unique").on(t.itemId, t.warehouseId, t.lotId, t.batchId),
    index("sb_item").on(t.itemId),
  ]
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorId: integer("actor_id").notNull().references(() => users.id),
    action: text("action").notNull(), // e.g. "production_order.start"
    entity: text("entity").notNull(), // table name
    entityId: integer("entity_id"),
    before: text("before"), // JSON
    after: text("after"), // JSON
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index("al_entity").on(t.entity, t.entityId), index("al_created").on(t.createdAt)]
);
