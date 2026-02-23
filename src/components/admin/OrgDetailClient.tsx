"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { UserManagementTable } from "@/components/admin/UserManagementTable";
import { InviteUserDialog } from "@/components/admin/InviteUserDialog";

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

interface OrgDetailClientProps {
  organizationId: string;
  orgType: "PLATFORM" | "PARTNER" | "DIRECT_CLIENT";
  users: OrgUser[];
}

export function OrgDetailClient({ organizationId, orgType, users: initialUsers }: OrgDetailClientProps) {
  const [users, setUsers] = useState(initialUsers);
  const [inviteOpen, setInviteOpen] = useState(false);

  const refreshUsers = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${organizationId}/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data ?? []);
      }
    } catch {
      // silent — keep current data
    }
  }, [organizationId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="w-4 h-4 mr-1.5" />
          Invite User
        </Button>
      </div>

      <UserManagementTable
        organizationId={organizationId}
        users={users}
        currentUserRole="platform_admin"
        onRefresh={refreshUsers}
      />

      <InviteUserDialog
        organizationId={organizationId}
        orgType={orgType}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={refreshUsers}
      />
    </div>
  );
}
