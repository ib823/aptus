"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Invitation {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface PendingInvitationsTableProps {
  organizationId: string;
  refreshKey: number;
}

const ROLE_LABELS: Record<string, string> = {
  platform_admin: "Platform Admin",
  partner_lead: "Partner Lead",
  consultant: "Consultant",
  project_manager: "Project Manager",
  solution_architect: "Solution Architect",
  process_owner: "Process Owner",
  it_lead: "IT Lead",
  data_migration_lead: "Data Migration Lead",
  executive_sponsor: "Executive Sponsor",
  viewer: "Viewer",
  client_admin: "Client Admin",
};

export function PendingInvitationsTable({ organizationId, refreshKey }: PendingInvitationsTableProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizations/${organizationId}/invitations`);
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.data ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations, refreshKey]);

  const handleRevoke = useCallback(async (invitationId: string) => {
    setRevoking(invitationId);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/invitations?invitationId=${invitationId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      }
    } catch {
      // silent
    } finally {
      setRevoking(null);
    }
  }, [organizationId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-2">Loading invitations...</p>;
  }

  if (invitations.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-2">Pending Invitations</h3>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Invited</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expires</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {invitations.map((inv) => {
              const isExpired = new Date(inv.expiresAt) < new Date();
              return (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{inv.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{ROLE_LABELS[inv.role] ?? inv.role}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {isExpired ? (
                      <Badge variant="destructive" className="text-xs">Expired</Badge>
                    ) : (
                      <span className="text-muted-foreground">{new Date(inv.expiresAt).toLocaleDateString()}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 text-xs"
                      disabled={revoking === inv.id}
                      onClick={() => handleRevoke(inv.id)}
                    >
                      {revoking === inv.id ? "Revoking..." : "Revoke"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
