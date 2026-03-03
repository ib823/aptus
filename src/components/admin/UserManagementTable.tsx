"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROLE_METADATA, getRolesForOrgType } from "@/lib/auth/role-metadata";
import { normalizeOrgType } from "@/lib/utils/org-type";
import type { UserRole } from "@/types/assessment";

interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  deactivatedAt: string | null;
}

interface UserManagementTableProps {
  organizationId: string;
  orgType: string;
  users: OrgUser[];
  currentUserRole: string;
  onRefresh: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  platform_admin: "bg-red-100 text-red-800",
  partner_lead: "bg-purple-100 text-purple-800",
  consultant: "bg-blue-100 text-blue-800",
  project_manager: "bg-indigo-100 text-indigo-800",
  solution_architect: "bg-cyan-100 text-cyan-800",
  process_owner: "bg-green-100 text-green-800",
  it_lead: "bg-teal-100 text-teal-800",
  data_migration_lead: "bg-orange-100 text-orange-800",
  executive_sponsor: "bg-amber-100 text-amber-800",
  viewer: "bg-slate-50 text-slate-500",
  client_admin: "bg-pink-100 text-pink-800",
};

export function UserManagementTable({
  organizationId,
  orgType,
  users,
  currentUserRole,
  onRefresh,
}: UserManagementTableProps) {
  const [roleChangeDialog, setRoleChangeDialog] = useState<{ userId: string; currentRole: string; newRole: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManageUsers = ["platform_admin", "partner_lead", "client_admin"].includes(currentUserRole);

  const filteredRoles = getRolesForOrgType(normalizeOrgType(orgType));

  const getRoleLabel = (role: string): string =>
    ROLE_METADATA[role as UserRole]?.label ?? role;

  const handleRoleChange = useCallback(async () => {
    if (!roleChangeDialog) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/organizations/${organizationId}/users/${roleChangeDialog.userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleChangeDialog.newRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to update role");
        setSaving(false);
        return;
      }

      setRoleChangeDialog(null);
      setSaving(false);
      onRefresh();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }, [roleChangeDialog, organizationId, onRefresh]);

  const handleDeactivate = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/organizations/${organizationId}/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });

      if (res.ok) onRefresh();
    } catch {
      // silent
    }
  }, [organizationId, onRefresh]);

  const handleReactivate = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/organizations/${organizationId}/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });

      if (res.ok) onRefresh();
    } catch {
      // silent
    }
  }, [organizationId, onRefresh]);

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">MFA</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              {canManageUsers && (
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge className={ROLE_COLORS[user.role] ?? "bg-slate-50 text-slate-500"}>
                    {getRoleLabel(user.role)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={user.mfaEnabled ? "default" : "outline"} className="text-xs">
                    {user.mfaEnabled ? "Enabled" : "Off"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={user.isActive ? "default" : "destructive"} className="text-xs">
                    {user.isActive ? "Active" : "Deactivated"}
                  </Badge>
                </td>
                {canManageUsers && (
                  <td className="px-4 py-3 text-right space-x-1">
                    <Select
                      value={user.role}
                      onValueChange={(newRole) => {
                        if (newRole !== user.role) {
                          setRoleChangeDialog({ userId: user.id, currentRole: user.role, newRole });
                        }
                      }}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs inline-flex">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredRoles.map((value) => (
                          <SelectItem key={value} value={value}>{getRoleLabel(value)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {user.isActive ? (
                      <Button variant="ghost" size="sm" className="text-red-600 text-xs" onClick={() => handleDeactivate(user.id)}>
                        Deactivate
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-green-600 text-xs" onClick={() => handleReactivate(user.id)}>
                        Reactivate
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!roleChangeDialog} onOpenChange={(open) => { if (!open) { setRoleChangeDialog(null); setError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Role Change</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm">
              Change role from{" "}
              <Badge className={ROLE_COLORS[roleChangeDialog?.currentRole ?? ""] ?? ""}>
                {getRoleLabel(roleChangeDialog?.currentRole ?? "")}
              </Badge>
              {" to "}
              <Badge className={ROLE_COLORS[roleChangeDialog?.newRole ?? ""] ?? ""}>
                {getRoleLabel(roleChangeDialog?.newRole ?? "")}
              </Badge>?
            </p>
            <p className="text-xs text-muted-foreground">
              This will revoke all active sessions for this user.
            </p>
            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setRoleChangeDialog(null)}>Cancel</Button>
              <Button onClick={handleRoleChange} disabled={saving}>
                {saving ? "Saving..." : "Confirm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
