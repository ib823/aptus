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
      <h1 className="text-3xl font-bold text-gray-950 tracking-tight mb-1">Users</h1>
      <p className="text-base text-gray-600 mb-8">
        All registered users ({users.length})
      </p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2 text-left font-medium text-gray-500">Name</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Email</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Role</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">MFA</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Last Login</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{u.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-gray-600">{u.email}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    u.role === "admin"
                      ? "bg-purple-100 text-purple-700"
                      : u.role === "consultant"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs ${u.mfaEnabled ? "text-green-600" : "text-gray-400"}`}>
                    {u.mfaEnabled ? "Enabled" : "Off"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-400">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Never"}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-400">
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
