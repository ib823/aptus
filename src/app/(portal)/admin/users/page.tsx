import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      mfaEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-5xl">
      <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">Users</h1>
      <p className="text-base text-muted-foreground mb-8">
        All registered users ({users.length})
      </p>

      <div className="bg-card rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">MFA</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Last Login</th>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border/50 hover:bg-accent">
                <td className="px-4 py-2.5 font-medium text-foreground">{u.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    u.role === "admin"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                      : u.role === "consultant"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : "bg-muted text-muted-foreground"
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs ${u.mfaEnabled ? "text-green-600 dark:text-green-400" : "text-muted-foreground/60"}`}>
                    {u.mfaEnabled ? "Enabled" : "Off"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground/60">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Never"}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground/60">
                  {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
