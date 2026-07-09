"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Factory,
  LayoutDashboard,
  Map,
  Boxes,
  Layers,
  Settings2,
  LogOut,
  Menu,
  Moon,
  Sun,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { logout } from "@/modules/auth/actions";
import type { SessionUser } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/production", label: "Production", icon: Factory },
  { href: "/layout-map", label: "Site Layout", icon: Map },
  { href: "/quality", label: "Quality", icon: ShieldCheck },
  { href: "/batches", label: "Batches", icon: Layers },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/procurement", label: "Procurement", icon: Truck },
  { href: "/masters", label: "Masters", icon: Settings2, adminOnly: true },
];

export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = NAV.filter((n) => !n.adminOnly || user.role === "admin");

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-5">
        <Image src="/urvar-mark.png" alt="" width={28} height={29} className="h-7 w-auto shrink-0" />
        <div>
          <div className="text-sm font-semibold leading-none">Urvar ERP</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Kisanbandhu Plant</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs capitalize text-muted-foreground">{user.role}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>
        </div>
        <form action={logout}>
          <Button variant="outline" size="sm" className="w-full" type="submit">
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — a visibly distinct, slightly deeper shade than the
          content area (bg-sidebar, not bg-card) is the defining Notion trait. */}
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-sidebar-border bg-sidebar">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </Button>
          <Image src="/urvar-mark.png" alt="" width={22} height={23} className="h-[22px] w-auto" />
          <span className="text-sm font-semibold">Urvar ERP</span>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
