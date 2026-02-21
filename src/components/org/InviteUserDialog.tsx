"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALL_ROLES } from "@/lib/auth/role-permissions";
import { ROLE_LABELS } from "@/types/assessment";

interface InviteUserDialogProps {
  organizationId: string;
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

export function InviteUserDialog({
  organizationId,
  open,
  onClose,
  onInvited,
}: InviteUserDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("consultant");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (res.ok) {
        setEmail("");
        setRole("consultant");
        onInvited();
        onClose();
      } else {
        const json = await res.json();
        setError(json.error?.message ?? "Failed to invite user");
      }
    } finally {
      setSubmitting(false);
    }
  }, [organizationId, email, role, onInvited, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Invite User</h3>

        <div className="space-y-4">
          <div>
            <Label htmlFor="invite-email">Email Address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full h-9 px-3 text-sm border border-input rounded-md bg-background"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !email}>
            {submitting ? "Inviting..." : "Send Invitation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
