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
  uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos", "tractor", "roll"] }).notNull(),
  // finished_good items link back to a product (one item per product, stock kept in product's base uom)
  productId: integer("product_id").references(() => products.id),
  reorderLevel: real("reorder_level").notNull().default(0),
  // Free-text purchasing note, e.g. "Min 1000 pcs per lot" — not system-enforced, just a
  // reference visible on the item so whoever places the PO doesn't have to remember it.
  remarks: text("remarks"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const warehouses = sqliteTable("warehouses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  location: text("location"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// Optional sub-locations within a warehouse. A warehouse with zero zones
// behaves exactly as before — every zoneId reference elsewhere is nullable.
export const warehouseZones = sqliteTable(
  "warehouse_zones",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    name: text("name").notNull(),
    code: text("code"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("wz_warehouse").on(t.warehouseId)]
);

export const vendors = sqliteTable("vendors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  gstin: text("gstin"),
  address: text("address"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const formulas = sqliteTable("formulas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  productId: integer("product_id").notNull().references(() => products.id),
  outputQty: real("output_qty").notNull(), // e.g. 1
  outputUom: text("output_uom", { enum: ["kg", "ton", "bag", "litre", "nos", "tractor", "roll"] }).notNull(),
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
  // Zone outline on the site plan as a JSON [x,y][] in feet (same
  // coordinate space as beds; y grows northward). Nullable only for
  // legacy rows — the map skips zones without one.
  polygon: text("polygon"),
  // Where the zone's map label anchors, in the same feet space. Kept as
  // data (not derived from the polygon centroid) so labels can sit clear
  // of bed rows.
  labelX: real("label_x"),
  labelY: real("label_y"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const beds = sqliteTable(
  "beds",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    zoneId: integer("zone_id").notNull().references(() => zones.id),
    code: text("code").notNull().unique(), // Z1-01 … Z2-15
    // Bed centerline endpoints on the site plan, in feet (y increases
    // northward). General (x1,y1)-(x2,y2) segment, not axis-aligned —
    // lets beds sit at any angle, matching the surveyed plan exactly.
    x1: real("x1").notNull(),
    y1: real("y1").notNull(),
    x2: real("x2").notNull(),
    y2: real("y2").notNull(),
    widthFt: real("width_ft").notNull(),
    lengthFt: real("length_ft").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("beds_zone").on(t.zoneId)]
);

// Everything drawn on the site map that isn't a bed or a zone: the plot
// boundary, the access strip, and structures (sheds, godowns, tanks…).
// One table so the whole map is data-driven — adding a fixture is an
// insert, not a code change. Geometry is a JSON [x,y][] polygon in the
// same feet space as beds (structures are stored as polygons even though
// the editor draws rectangles, leaving room for rotated shapes later).
export const siteFeatures = sqliteTable("site_features", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["boundary", "strip", "structure"] }).notNull(),
  structureType: text("structure_type", {
    enum: ["shed", "godown", "tank", "office", "other"],
  }), // structures only
  label: text("label"),
  polygon: text("polygon").notNull(),
  // Optional link to an inventory warehouse for storage buildings — the
  // Machine Shed & Godown is both a map structure and a warehouse.
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// ---------- Production ----------

export const productionOrders = sqliteTable("production_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderNo: text("order_no").notNull().unique(), // PO-YYMM-###
  productId: integer("product_id").notNull().references(() => products.id),
  formulaId: integer("formula_id").notNull().references(() => formulas.id),
  templateId: integer("template_id").notNull().references(() => workflowTemplates.id),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  targetQty: real("target_qty").notNull(),
  uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos", "tractor", "roll"] }).notNull(),
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
    // Manually flagged by whoever records the reading — no threshold config
    // exists on workflow stages yet, so this isn't automatic.
    isDeviation: integer("is_deviation", { mode: "boolean" }).notNull().default(false),
    // Which specific bed this reading was taken from, when the order has
    // beds assigned (an order can span multiple beds with different
    // conditions). Null for orders with no bed assignment.
    bedId: integer("bed_id").references(() => beds.id),
    recordedBy: integer("recorded_by").notNull().references(() => users.id),
    recordedAt: text("recorded_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index("sr_stage").on(t.orderStageId), index("sr_bed").on(t.bedId)]
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
    // When this specific bed joined the order — may be later than the
    // order's own start if a bed is added mid-run. Drives "days in bed".
    assignedAt: text("assigned_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("ob_order_bed").on(t.orderId, t.bedId), index("ob_bed").on(t.bedId)]
);

// Rolling maintenance log for occupied beds: watering (7d), turning (10d),
// bio-enzyme application (15d). Scoped to orderBedId (a specific bed's
// occupancy of a specific order), not bare bedId, so history doesn't blend
// if the same physical bed is reused by a later, different order.
// order_beds.assignedAt is already the "windrow formation" anchor date —
// due dates are computed on read (see getBedLayout), not stored here.
export const bedMaintenanceLog = sqliteTable(
  "bed_maintenance_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderBedId: integer("order_bed_id")
      .notNull()
      .references(() => orderBeds.id, { onDelete: "cascade" }),
    taskType: text("task_type", { enum: ["watering", "turning", "bio_enzyme"] }).notNull(),
    // Only set for taskType = "bio_enzyme": the raw_material item applied
    // and qty deducted from stock (picked via an item selector rather than
    // a hardcoded item id, so a rename doesn't silently break this).
    itemId: integer("item_id").references(() => items.id),
    qtyApplied: real("qty_applied"),
    notes: text("notes"),
    performedBy: integer("performed_by").notNull().references(() => users.id),
    performedAt: text("performed_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [
    index("bml_order_bed").on(t.orderBedId),
    index("bml_task").on(t.orderBedId, t.taskType),
  ]
);

// ---------- Procurement ----------

export const purchaseOrders = sqliteTable("purchase_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  poNo: text("po_no").notNull().unique(), // PUR-YYMM-### (production orders already own "PO-")
  vendorId: integer("vendor_id").notNull().references(() => vendors.id),
  status: text("status", {
    enum: ["draft", "approved", "partially_received", "closed", "cancelled"],
  })
    .notNull()
    .default("draft"),
  expectedDeliveryDate: text("expected_delivery_date"),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: text("approved_at"),
});

export const purchaseOrderLines = sqliteTable(
  "purchase_order_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    poId: integer("po_id").notNull().references(() => purchaseOrders.id),
    itemId: integer("item_id").notNull().references(() => items.id),
    qty: real("qty").notNull(),
    uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos", "tractor", "roll"] }).notNull(),
    rate: real("rate").notNull(),
    // Running fulfillment total, updated by createGoodsReceipt — also doubles
    // as the source for "last rate paid" lookups (a line IS a rate data point).
    receivedQty: real("received_qty").notNull().default(0),
  },
  (t) => [index("pol_po").on(t.poId), index("pol_item").on(t.itemId)]
);

// ---------- Traceability ----------

export const lots = sqliteTable("lots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotNo: text("lot_no").notNull().unique(), // LOT-YYMM-###
  itemId: integer("item_id").notNull().references(() => items.id),
  supplierName: text("supplier_name").notNull(),
  // Optional link to the vendor master / purchase order this receipt
  // fulfilled — null for ad-hoc receipts, which keep working exactly as
  // before via the supplierName text column above.
  vendorId: integer("vendor_id").references(() => vendors.id),
  poId: integer("po_id").references(() => purchaseOrders.id),
  poLineId: integer("po_line_id").references(() => purchaseOrderLines.id),
  receivedQty: real("received_qty").notNull(),
  uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos", "tractor", "roll"] }).notNull(),
  receivedDate: text("received_date").notNull(),
  vehicleNo: text("vehicle_no"),
  remarks: text("remarks"),
  // Cost per unit at receipt — copied from the PO line's rate when linked,
  // or entered directly for ad-hoc receipts. Null means no cost was ever
  // recorded for this lot (e.g. an ad-hoc receipt where the rate was left
  // blank); batch costing must treat that as "unknown," not zero.
  rate: real("rate"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  // Incoming inspection — recorded after receipt, not blocking it. Only a
  // "rejected" result excludes this lot from production FIFO issue.
  qcStatus: text("qc_status", { enum: ["pending", "accepted", "rejected"] })
    .notNull()
    .default("pending"),
  moisturePct: real("moisture_pct"),
  foreignMatterPct: real("foreign_matter_pct"),
  odour: text("odour", { enum: ["normal", "off"] }),
  visualCondition: text("visual_condition", { enum: ["good", "fair", "poor"] }),
  inspectionRemarks: text("inspection_remarks"),
  inspectedBy: integer("inspected_by").references(() => users.id),
  inspectedAt: text("inspected_at"),
});

export const batches = sqliteTable("batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchNo: text("batch_no").notNull().unique(), // UV-{CODE}-{YYMMDD}-##
  orderId: integer("order_id").notNull().references(() => productionOrders.id),
  productId: integer("product_id").notNull().references(() => products.id),
  mfgDate: text("mfg_date").notNull(),
  expiryDate: text("expiry_date").notNull(),
  qtyProduced: real("qty_produced").notNull(),
  uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos", "tractor", "roll"] }).notNull(),
  expectedQty: real("expected_qty").notNull(),
  yieldPct: real("yield_pct").notNull(),
  warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
  qcStatus: text("qc_status", {
    enum: ["pending", "sample_collected", "testing", "released", "hold"],
  })
    .notNull()
    .default("pending"),
  dispatchStatus: text("dispatch_status", { enum: ["in_stock", "partial", "dispatched"] })
    .notNull()
    .default("in_stock"),
  // Manual lump-sum entries at Complete Order time — not derived/traced like
  // material cost, just recorded. Null means not entered, not zero cost.
  laborCost: real("labor_cost"),
  overheadCost: real("overhead_cost"),
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
    uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos", "tractor", "roll"] }).notNull(),
  },
  (t) => [index("bi_batch").on(t.batchId), index("bi_lot").on(t.lotId)]
);

// Finished-product testing. Flexible parameter/value rows (matches
// stage_readings), since a batch test covers many disparate parameters.
export const batchTestResults = sqliteTable(
  "batch_test_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    batchId: integer("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    parameter: text("parameter", {
      enum: [
        "moisture",
        "organic_carbon",
        "nitrogen",
        "phosphorus",
        "potassium",
        "cn_ratio",
        "ph",
        "ec",
        "bulk_density",
        "particle_size",
        "appearance",
        "odour",
        "other",
      ],
    }).notNull(),
    value: real("value"),
    textValue: text("text_value"), // for qualitative params like appearance/odour
    unit: text("unit"),
    recordedBy: integer("recorded_by").notNull().references(() => users.id),
    recordedAt: text("recorded_at").notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index("btr_batch").on(t.batchId)]
);

// Corrective and Preventive Action — typically triggered by a QC failure,
// but standalone (issue with no linked batch/lot) is also valid.
export const capas = sqliteTable("capas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  capaNo: text("capa_no").notNull().unique(), // CAPA-YYMM-###
  issue: text("issue").notNull(),
  rootCause: text("root_cause"),
  correctiveAction: text("corrective_action"),
  preventiveAction: text("preventive_action"),
  responsibleUserId: integer("responsible_user_id").references(() => users.id),
  deadline: text("deadline"),
  status: text("status", { enum: ["open", "in_progress", "verification", "closed"] })
    .notNull()
    .default("open"),
  linkedBatchId: integer("linked_batch_id").references(() => batches.id),
  linkedLotId: integer("linked_lot_id").references(() => lots.id),
  verificationNotes: text("verification_notes"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  closedAt: text("closed_at"),
});

// Warehouse-to-warehouse stock movement. Not QC-gated (a location change,
// not a dispatch) — the identity of the actual movement lives in
// inventory_transactions rows (ref_type="transfer", ref_id=this.id), since a
// raw-material transfer can span multiple FIFO lots.
export const transfers = sqliteTable("transfers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transferNo: text("transfer_no").notNull().unique(), // TRF-YYMM-###
  itemId: integer("item_id").notNull().references(() => items.id),
  batchId: integer("batch_id").references(() => batches.id), // required for finished_good items
  qty: real("qty").notNull(),
  uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos", "tractor", "roll"] }).notNull(),
  fromWarehouseId: integer("from_warehouse_id").notNull().references(() => warehouses.id),
  toWarehouseId: integer("to_warehouse_id").notNull().references(() => warehouses.id),
  fromZoneId: integer("from_zone_id").references(() => warehouseZones.id),
  toZoneId: integer("to_zone_id").references(() => warehouseZones.id),
  remarks: text("remarks"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ---------- Inventory ----------

export const inventoryTransactions = sqliteTable(
  "inventory_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", {
      enum: [
        "goods_receipt",
        "issue_to_production",
        "issue_to_bed_maintenance",
        "production_output",
        "adjustment",
        "transfer_out",
        "transfer_in",
      ],
    }).notNull(),
    itemId: integer("item_id").notNull().references(() => items.id),
    warehouseId: integer("warehouse_id").notNull().references(() => warehouses.id),
    zoneId: integer("zone_id").references(() => warehouseZones.id),
    lotId: integer("lot_id").references(() => lots.id),
    batchId: integer("batch_id").references(() => batches.id),
    qty: real("qty").notNull(), // signed: + in, - out
    uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos", "tractor", "roll"] }).notNull(),
    refType: text("ref_type"), // e.g. "production_order", "lot", "manual", "transfer"
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
    zoneId: integer("zone_id").references(() => warehouseZones.id),
    lotId: integer("lot_id").references(() => lots.id),
    batchId: integer("batch_id").references(() => batches.id),
    qty: real("qty").notNull().default(0),
    uom: text("uom", { enum: ["kg", "ton", "bag", "litre", "nos", "tractor", "roll"] }).notNull(),
  },
  (t) => [
    uniqueIndex("sb_unique").on(t.itemId, t.warehouseId, t.zoneId, t.lotId, t.batchId),
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
