import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["platform_admin", "admin"].includes(user.role)) redirect("/dashboard");

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <AdminSidebar />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
