import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <AppShell user={user}>{children}</AppShell>;
}
