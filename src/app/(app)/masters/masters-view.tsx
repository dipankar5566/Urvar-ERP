"use client";

import { Plus, Pencil } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog, NativeSelect } from "@/components/form-dialog";
import { saveProduct, saveItem, saveWarehouse, saveUser } from "@/modules/masters/actions";
import {
  type Product,
  type Item,
  type Warehouse,
  type Formula,
  type FormulaLine,
  type WorkflowTemplate,
  type WorkflowTemplateStage,
  type SafeUser,
  UOMS,
  ITEM_CATEGORIES,
  categoryLabel,
} from "@/modules/masters/types";
import { FormulaEditor } from "./formula-editor";
import { WorkflowEditor } from "./workflow-editor";

export function MastersView(props: {
  products: Product[];
  items: Item[];
  warehouses: Warehouse[];
  formulas: Formula[];
  formulaLines: FormulaLine[];
  templates: WorkflowTemplate[];
  templateStages: WorkflowTemplateStage[];
  users: SafeUser[];
}) {
  return (
    <div>
      <h1 className="text-xl font-semibold">Masters</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Products, items, formulas, workflows, warehouses, and users.
      </p>

      <Tabs defaultValue="products" className="mt-6">
        <TabsList className="flex-wrap">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="formulas">Formulas</TabsTrigger>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        {/* ---------- Products ---------- */}
        <TabsContent value="products" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <ProductDialog
              trigger={
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Add Product
                </Button>
              }
            />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>HSN</TableHead>
                  <TableHead>Shelf Life</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.code}</TableCell>
                    <TableCell>{p.hsn ?? "—"}</TableCell>
                    <TableCell>{p.shelfLifeMonths} months</TableCell>
                    <TableCell>
                      <ProductDialog
                        product={p}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ---------- Items ---------- */}
        <TabsContent value="items" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <ItemDialog
              products={props.products}
              trigger={
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Add Item
                </Button>
              }
            />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>UoM</TableHead>
                  <TableHead>Reorder Level</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{categoryLabel(i.category)}</Badge>
                    </TableCell>
                    <TableCell>{i.uom}</TableCell>
                    <TableCell>
                      {i.reorderLevel > 0 ? `${i.reorderLevel} ${i.uom}` : "—"}
                    </TableCell>
                    <TableCell>
                      <ItemDialog
                        item={i}
                        products={props.products}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ---------- Formulas ---------- */}
        <TabsContent value="formulas" className="mt-4">
          <FormulaEditor
            formulas={props.formulas}
            formulaLines={props.formulaLines}
            products={props.products}
            items={props.items}
          />
        </TabsContent>

        {/* ---------- Workflows ---------- */}
        <TabsContent value="workflows" className="mt-4">
          <WorkflowEditor
            templates={props.templates}
            templateStages={props.templateStages}
            products={props.products}
          />
        </TabsContent>

        {/* ---------- Warehouses ---------- */}
        <TabsContent value="warehouses" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <WarehouseDialog
              trigger={
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Add Warehouse
                </Button>
              }
            />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.warehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell>{w.location ?? "—"}</TableCell>
                    <TableCell>
                      <WarehouseDialog
                        warehouse={w}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ---------- Users ---------- */}
        <TabsContent value="users" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <UserDialog
              trigger={
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Add User
                </Button>
              }
            />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.username}</TableCell>
                    <TableCell className="capitalize">{u.role}</TableCell>
                    <TableCell>
                      <Badge variant={u.active ? "secondary" : "destructive"}>
                        {u.active ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <UserDialog
                        user={u}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Dialogs ----------

function ProductDialog({ product, trigger }: { product?: Product; trigger: React.ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={product ? "Edit Product" : "Add Product"} action={saveProduct}>
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="space-y-2">
        <Label htmlFor="p-name">Name</Label>
        <Input id="p-name" name="name" defaultValue={product?.name} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="p-code">Code</Label>
          <Input id="p-code" name="code" defaultValue={product?.code} maxLength={6} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-hsn">HSN</Label>
          <Input id="p-hsn" name="hsn" defaultValue={product?.hsn ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="p-shelf">Shelf life (months)</Label>
        <Input
          id="p-shelf"
          name="shelfLifeMonths"
          type="number"
          min={1}
          max={60}
          defaultValue={product?.shelfLifeMonths ?? 24}
          required
        />
      </div>
    </FormDialog>
  );
}

function ItemDialog({
  item,
  products,
  trigger,
}: {
  item?: Item;
  products: Product[];
  trigger: React.ReactNode;
}) {
  return (
    <FormDialog trigger={trigger} title={item ? "Edit Item" : "Add Item"} action={saveItem}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="space-y-2">
        <Label htmlFor="i-name">Name</Label>
        <Input id="i-name" name="name" defaultValue={item?.name} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="i-category">Category</Label>
          <NativeSelect id="i-category" name="category" defaultValue={item?.category ?? "raw_material"}>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="i-uom">Unit</Label>
          <NativeSelect id="i-uom" name="uom" defaultValue={item?.uom ?? "kg"}>
            {UOMS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="i-product">Linked product (finished goods only)</Label>
        <NativeSelect id="i-product" name="productId" defaultValue={item?.productId ?? ""}>
          <option value="">None</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="i-reorder">Reorder level</Label>
        <Input
          id="i-reorder"
          name="reorderLevel"
          type="number"
          min={0}
          step="any"
          defaultValue={item?.reorderLevel ?? 0}
        />
      </div>
    </FormDialog>
  );
}

function WarehouseDialog({ warehouse, trigger }: { warehouse?: Warehouse; trigger: React.ReactNode }) {
  return (
    <FormDialog
      trigger={trigger}
      title={warehouse ? "Edit Warehouse" : "Add Warehouse"}
      action={saveWarehouse}
    >
      {warehouse && <input type="hidden" name="id" value={warehouse.id} />}
      <div className="space-y-2">
        <Label htmlFor="w-name">Name</Label>
        <Input id="w-name" name="name" defaultValue={warehouse?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="w-location">Location</Label>
        <Input id="w-location" name="location" defaultValue={warehouse?.location ?? ""} />
      </div>
    </FormDialog>
  );
}

function UserDialog({ user, trigger }: { user?: SafeUser; trigger: React.ReactNode }) {
  return (
    <FormDialog trigger={trigger} title={user ? "Edit User" : "Add User"} action={saveUser}>
      {user && <input type="hidden" name="id" value={user.id} />}
      <div className="space-y-2">
        <Label htmlFor="u-name">Full name</Label>
        <Input id="u-name" name="name" defaultValue={user?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="u-username">Username</Label>
        <Input id="u-username" name="username" defaultValue={user?.username} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="u-password">{user ? "New password (leave blank to keep)" : "Password"}</Label>
        <Input id="u-password" name="password" type="password" autoComplete="new-password" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="u-role">Role</Label>
          <NativeSelect id="u-role" name="role" defaultValue={user?.role ?? "supervisor"}>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
          </NativeSelect>
        </div>
        <div className="flex items-end gap-2 pb-1">
          <input
            id="u-active"
            name="active"
            type="checkbox"
            defaultChecked={user?.active ?? true}
            className="h-4 w-4"
          />
          <Label htmlFor="u-active">Active</Label>
        </div>
      </div>
    </FormDialog>
  );
}
