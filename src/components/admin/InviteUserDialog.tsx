"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InviteUserDialogProps {
  organizationId: string;
  orgType: "PLATFORM" | "PARTNER" | "DIRECT_CLIENT";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const ROLES_BY_ORG_TYPE: Record<string, Array<{ value: string; label: string }>> = {
  PLATFORM: [
    { value: "platform_admin", label: "Platform Admin" },
  ],
  PARTNER: [
    { value: "partner_lead", label: "Partner Lead" },
    { value: "consultant", label: "Consultant" },
    { value: "project_manager", label: "Project Manager" },
    { value: "solution_architect", label: "Solution Architect" },
    { value: "data_migration_lead", label: "Data Migration Lead" },
    { value: "viewer", label: "Viewer" },
  ],
  DIRECT_CLIENT: [
    { value: "client_admin", label: "Client Admin" },
    { value: "process_owner", label: "Process Owner" },
    { value: "it_lead", label: "IT Lead" },
    { value: "data_migration_lead", label: "Data Migration Lead" },
    { value: "executive_sponsor", label: "Executive Sponsor" },
    { value: "project_manager", label: "Project Manager" },
    { value: "viewer", label: "Viewer" },
  ],
};

export function InviteUserDialog({
  organizationId,
  orgType,
  open,
  onOpenChange,
  onSuccess,
}: InviteUserDialogProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const availableRoles = ROLES_BY_ORG_TYPE[orgType] ?? [];

  const handleSubmit = async () => {
    if (!email || !role) return;
    setSending(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/organizations/${organizationId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to send invitation");
        setSending(false);
        return;
      }

      setSuccess(true);
      setSending(false);
      setEmail("");
      setRole("");
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(false);
        onSuccess();
      }, 1500);
    } catch {
      setError("Network error");
      setSending(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setEmail("");
      setRole("");
      setError(null);
      setSuccess(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label htmlFor="invite-email">Email address</Label>
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
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          {success && <p className="text-sm text-green-600 bg-green-50 p-2 rounded">Invitation sent successfully!</p>}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={sending || !email || !role}>
              {sending ? "Sending..." : "Send Invitation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
