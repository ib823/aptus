"use client";

import { useState, useCallback } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UI_TEXT } from "@/constants/ui-text";

interface Stakeholder {
  id: string;
  name: string;
  email: string;
  role: string;
  assignedAreas: string[];
  acceptedAt: string | null;
}

interface StakeholderManagerProps {
  assessmentId: string;
  stakeholders: Stakeholder[];
  onStakeholderAdded: () => void;
  canManage: boolean;
}

const ROLE_OPTIONS = [
  { value: "process_owner", label: UI_TEXT.roles.process_owner },
  { value: "it_lead", label: UI_TEXT.roles.it_lead },
  { value: "executive", label: UI_TEXT.roles.executive },
  { value: "consultant", label: UI_TEXT.roles.consultant },
];

export function StakeholderManager({
  assessmentId,
  stakeholders,
  onStakeholderAdded,
  canManage,
}: StakeholderManagerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newStakeholder, setNewStakeholder] = useState({
    name: "",
    email: "",
    role: "process_owner",
    assignedAreas: [] as string[],
  });

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        const response = await fetch(`/api/assessments/${assessmentId}/stakeholders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newStakeholder),
        });

        const data: { error?: { message: string } } = await response.json();

        if (!response.ok) {
          setError(data.error?.message ?? "Failed to add stakeholder");
          return;
        }

        setNewStakeholder({ name: "", email: "", role: "process_owner", assignedAreas: [] });
        setOpen(false);
        onStakeholderAdded();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [assessmentId, newStakeholder, onStakeholderAdded],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-950">
          {UI_TEXT.stakeholder.title}
        </h3>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <UserPlus className="w-4 h-4 mr-1.5" />
                {UI_TEXT.stakeholder.addButton}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{UI_TEXT.stakeholder.addButton}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4 mt-4">
                <div>
                  <label htmlFor="stakeholder-name" className="block text-sm font-medium text-gray-700 mb-1">
                    {UI_TEXT.stakeholder.name}
                  </label>
                  <Input
                    id="stakeholder-name"
                    value={newStakeholder.name}
                    onChange={(e) => setNewStakeholder((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="stakeholder-email" className="block text-sm font-medium text-gray-700 mb-1">
                    {UI_TEXT.stakeholder.email}
                  </label>
                  <Input
                    id="stakeholder-email"
                    type="email"
                    value={newStakeholder.email}
                    onChange={(e) => setNewStakeholder((prev) => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="stakeholder-role" className="block text-sm font-medium text-gray-700 mb-1">
                    {UI_TEXT.stakeholder.role}
                  </label>
                  <Select
                    value={newStakeholder.role}
                    onValueChange={(val) => setNewStakeholder((prev) => ({ ...prev, role: val }))}
                  >
                    <SelectTrigger id="stakeholder-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? "Adding..." : UI_TEXT.stakeholder.inviteButton}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-2">
        {stakeholders.map((stakeholder) => (
          <div
            key={stakeholder.id}
            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-sm font-medium text-blue-600">
                {stakeholder.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-950">
                  {stakeholder.name}
                </p>
                <p className="text-xs text-gray-500">{stakeholder.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-gray-500">
                {(UI_TEXT.roles as Record<string, string>)[stakeholder.role] ?? stakeholder.role}
              </span>
              <span
                className={`text-xs ${
                  stakeholder.acceptedAt
                    ? "text-green-600"
                    : "text-amber-600"
                }`}
              >
                {stakeholder.acceptedAt
                  ? UI_TEXT.stakeholder.accepted
                  : UI_TEXT.stakeholder.pendingInvitation}
              </span>
              {canManage && (
                <button
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  aria-label={UI_TEXT.stakeholder.removeButton}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
