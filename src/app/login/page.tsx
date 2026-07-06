import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Urvar ERP</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Urvar Natural Pvt. Ltd. — Manufacturing
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
