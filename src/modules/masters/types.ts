import type { InferSelectModel } from "drizzle-orm";
import type {
  products,
  items,
  warehouses,
  formulas,
  formulaLines,
  workflowTemplates,
  workflowTemplateStages,
  users,
} from "@/db/schema";

export type Product = InferSelectModel<typeof products>;
export type Item = InferSelectModel<typeof items>;
export type Warehouse = InferSelectModel<typeof warehouses>;
export type Formula = InferSelectModel<typeof formulas>;
export type FormulaLine = InferSelectModel<typeof formulaLines>;
export type WorkflowTemplate = InferSelectModel<typeof workflowTemplates>;
export type WorkflowTemplateStage = InferSelectModel<typeof workflowTemplateStages>;
export type SafeUser = Omit<InferSelectModel<typeof users>, "passwordHash">;

export const UOMS = ["kg", "ton", "bag", "litre", "nos"] as const;
export const ITEM_CATEGORIES = [
  { value: "raw_material", label: "Raw Material" },
  { value: "packing_material", label: "Packing Material" },
  { value: "finished_good", label: "Finished Good" },
  { value: "consumable", label: "Consumable" },
  { value: "scrap", label: "Scrap" },
] as const;

export function categoryLabel(value: string): string {
  return ITEM_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
