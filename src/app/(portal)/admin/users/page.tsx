import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { User, ShieldCheck, Clock, Mail, Calendar } from "lucide-react";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
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
    <div className="max-w-5xl mx-auto pb-12">
      <h1 className="text-3xl font-bold text-foreground tracking-tight mb-1">Users</h1>
      <p className="text-base text-muted-foreground mb-8">
        All registered users ({users.length})
      </p>

      {/* Desktop Table */}
      <div className="hidden md:block bg-card rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">MFA</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{u.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    u.role === "admin" || u.role === "platform_admin"
                      ? "bg-purple-100 text-purple-700"
                      : u.role === "consultant"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-600"
                  }`}>
                    {u.role.replace('_', ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs ${u.mfaEnabled ? "text-green-600 font-medium" : "text-muted-foreground/60"}`}>
                    {u.mfaEnabled ? "Enabled" : "Off"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground/60">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Never"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground/60">
                  {new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {users.map((u) => (
          <div key={u.id} className="bg-card border rounded-lg p-4 shadow-sm space-y-3">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-muted flex items-center justify-center">
                  <User className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-bold text-foreground">{u.name ?? "Unknown User"}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="size-3" /> {u.email}
                  </p>
                </div>
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                u.role === "admin" || u.role === "platform_admin"
                  ? "bg-purple-100 text-purple-700"
                  : "bg-blue-100 text-blue-700"
              }`}>
                {u.role.split('_')[0]}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 py-2 border-t border-b border-dashed">
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">MFA Status</p>
                <p className="text-xs flex items-center gap-1">
                  <ShieldCheck className={`size-3 ${u.mfaEnabled ? "text-green-600" : "text-muted-foreground"}`} />
                  {u.mfaEnabled ? "Protected" : "Disabled"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Last Activity</p>
                <p className="text-xs flex items-center gap-1">
                  <Clock className="size-3 text-muted-foreground" />
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="size-3" /> Registered {new Date(u.createdAt).toLocaleDateString()}
              </span>
              <span className="text-muted-foreground/40 font-mono">{u.id.slice(-8)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
