import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { UserManagementTable } from "@/components/org/UserManagementTable";
import { mapLegacyRole } from "@/lib/auth/role-migration";

export default async function OrganizationUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user.organizationId) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">User Management</h1>
        <p className="text-muted-foreground">You are not currently assigned to an organization.</p>
      </div>
    );
  }

  const role = mapLegacyRole(user.role);
  const canManageUsers = role === "platform_admin" || role === "partner_lead" || role === "client_admin";

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">User Management</h1>
      <UserManagementTable
        organizationId={user.organizationId}
        canManageUsers={canManageUsers}
      />
    </div>
  );
}
