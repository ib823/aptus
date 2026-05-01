"use client";

import { useState, useCallback } from "react";
import {
  User, Mail, ShieldCheck, Clock, Calendar,
  Trash2, ShieldOff, RotateCcw, MoreHorizontal, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GatedButton } from "@/components/ui/gated-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ROLE_LABELS, type UserRole } from "@/types/assessment";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AdminUsersClientProps {
  initialUsers: AdminUser[];
  currentUserId: string;
}

type PendingAction =
  | { type: "delete"; user: AdminUser }
  | { type: "role"; user: AdminUser; newRole: string }
  | null;

export function AdminUsersClient({ initialUsers, currentUserId }: AdminUsersClientProps) {
  const [users, setUsers] = useState(initialUsers);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const apiCall = useCallback(async (
    userId: string,
    method: "PATCH" | "DELETE",
    body?: Record<string, unknown>,
  ) => {
    setLoading(userId);
    try {
      const init: RequestInit = { method };
      if (body) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
      }
      const res = await fetch(`/api/admin/users/${userId}`, init);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Action failed");
        return null;
      }
      return json.data;
    } catch {
      toast.error("Network error. Please try again.");
      return null;
    } finally {
      setLoading(null);
    }
  }, []);

  const handleRoleChange = useCallback(async (userId: string, newRole: string) => {
    const updated = await apiCall(userId, "PATCH", { role: newRole });
    if (updated) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updated } : u)));
      toast.success(`Role changed to ${ROLE_LABELS[newRole as UserRole] ?? newRole}`);
    }
    setPendingAction(null);
  }, [apiCall]);

  const handleToggleActive = useCallback(async (user: AdminUser) => {
    const newActive = !user.isActive;
    const updated = await apiCall(user.id, "PATCH", { isActive: newActive });
    if (updated) {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...updated } : u)));
      toast.success(newActive ? `${user.name ?? user.email} reactivated` : `${user.name ?? user.email} deactivated`);
    }
  }, [apiCall]);

  const handleResetMfa = useCallback(async (user: AdminUser) => {
    const updated = await apiCall(user.id, "PATCH", { resetMfa: true });
    if (updated) {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...updated } : u)));
      toast.success(`MFA reset for ${user.name ?? user.email}`);
    }
  }, [apiCall]);

  const handleDelete = useCallback(async (userId: string) => {
    const result = await apiCall(userId, "DELETE");
    if (result) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success("User deleted");
    }
    setPendingAction(null);
  }, [apiCall]);

  // ─── Add User ───
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserSubmitting, setAddUserSubmitting] = useState(false);

  const handleAddUser = useCallback(async (data: { email: string; name: string; role: string }) => {
    setAddUserSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, name: data.name, role: data.role }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Failed to create user");
        return;
      }
      setUsers((prev) => [json.data, ...prev]);
      setAddUserOpen(false);
      const sent = json.data?.emailSent !== false;
      toast.success(
        sent
          ? `User ${data.email} created — sign-in link sent`
          : `User ${data.email} created — email delivery failed, ask them to request a magic link from /login`,
      );
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setAddUserSubmitting(false);
    }
  }, []);

  const isSelf = (id: string) => id === currentUserId;
  const isLoading = (id: string) => loading === id;

  return (
    <>
      {/* Add User Button */}
      <div className="flex justify-end mb-4">
        <Button onClick={() => setAddUserOpen(true)}>
          <UserPlus className="w-4 h-4 mr-1.5" />
          Add User
        </Button>
      </div>

      {/* Desktop Table */}
      <div data-tour="user-table" className="hidden md:block bg-card rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">MFA</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Login</th>
              <th data-tour="user-actions" className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${!u.isActive ? "opacity-50" : ""}`}
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {u.name ?? "—"}
                  {isSelf(u.id) && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  {isSelf(u.id) ? (
                    <RoleBadge role={u.role} />
                  ) : (
                    <RoleSelect
                      currentRole={u.role}
                      onSelect={(newRole) => setPendingAction({ type: "role", user: u, newRole })}
                      disabled={isLoading(u.id)}
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium ${u.isActive ? "text-green-600" : "text-red-500"}`}>
                    {u.isActive ? "Active" : "Inactive"}
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
                <td className="px-4 py-3 text-right">
                  {!isSelf(u.id) && (
                    <div className="flex items-center justify-end gap-1">
                      {u.mfaEnabled && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Reset MFA"
                          onClick={() => handleResetMfa(u)}
                          disabled={isLoading(u.id)}
                        >
                          <ShieldOff className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={u.isActive ? "Deactivate" : "Reactivate"}
                        onClick={() => handleToggleActive(u)}
                        disabled={isLoading(u.id)}
                      >
                        {u.isActive ? (
                          <User className="h-4 w-4 text-orange-500" />
                        ) : (
                          <RotateCcw className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Delete user"
                        onClick={() => setPendingAction({ type: "delete", user: u })}
                        disabled={isLoading(u.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {users.map((u) => (
          <div key={u.id} className={`bg-card border rounded-lg p-4 shadow-sm space-y-3 ${!u.isActive ? "opacity-50" : ""}`}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-muted flex items-center justify-center">
                  <User className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-bold text-foreground">
                    {u.name ?? "Unknown User"}
                    {isSelf(u.id) && <span className="ml-1 text-xs font-normal text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="size-3" /> {u.email}
                  </p>
                </div>
              </div>
              <RoleBadge role={u.role} />
            </div>

            <div className="grid grid-cols-2 gap-4 py-2 border-t border-b border-dashed">
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Status</p>
                <p className={`text-xs font-medium ${u.isActive ? "text-green-600" : "text-red-500"}`}>
                  {u.isActive ? "Active" : "Inactive"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">MFA</p>
                <p className="text-xs flex items-center gap-1">
                  <ShieldCheck className={`size-3 ${u.mfaEnabled ? "text-green-600" : "text-muted-foreground"}`} />
                  {u.mfaEnabled ? "Protected" : "Disabled"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Calendar className="size-3" /> {new Date(u.createdAt).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="size-3" /> {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
              </span>
            </div>

            {!isSelf(u.id) && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setOpenMenuId(openMenuId === u.id ? null : u.id)}
                    disabled={isLoading(u.id)}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5 mr-1" />
                    Actions
                  </Button>
                  {openMenuId === u.id && (
                    <div className="absolute bottom-full left-0 mb-1 bg-card border rounded-lg shadow-lg py-1 z-10 min-w-[160px]">
                      {u.mfaEnabled && (
                        <button
                          className="w-full px-3 py-2 text-xs text-left hover:bg-muted transition-colors"
                          onClick={() => { setOpenMenuId(null); handleResetMfa(u); }}
                        >
                          Reset MFA
                        </button>
                      )}
                      <button
                        className="w-full px-3 py-2 text-xs text-left hover:bg-muted transition-colors"
                        onClick={() => { setOpenMenuId(null); handleToggleActive(u); }}
                      >
                        {u.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                      <button
                        className="w-full px-3 py-2 text-xs text-left text-destructive hover:bg-muted transition-colors"
                        onClick={() => { setOpenMenuId(null); setPendingAction({ type: "delete", user: u }); }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={pendingAction?.type === "delete"} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{pendingAction?.type === "delete" ? pendingAction.user.name ?? pendingAction.user.email : ""}</strong> and
              all their sessions, credentials, and stakeholder assignments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingAction?.type === "delete" && handleDelete(pendingAction.user.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Role Change Confirmation Dialog */}
      <AlertDialog open={pendingAction?.type === "role"} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change role?</AlertDialogTitle>
            <AlertDialogDescription>
              Change <strong>{pendingAction?.type === "role" ? pendingAction.user.name ?? pendingAction.user.email : ""}</strong> from{" "}
              <strong>{pendingAction?.type === "role" ? ROLE_LABELS[pendingAction.user.role as UserRole] ?? pendingAction.user.role : ""}</strong> to{" "}
              <strong>{pendingAction?.type === "role" ? ROLE_LABELS[pendingAction.newRole as UserRole] ?? pendingAction.newRole : ""}</strong>?
              Their active sessions will be revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingAction?.type === "role" && handleRoleChange(pendingAction.user.id, pendingAction.newRole)}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add User Dialog */}
      <AddUserDialog
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        onSubmit={handleAddUser}
        isSubmitting={addUserSubmitting}
      />
    </>
  );
}

function AddUserDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { email: string; name: string; role: string }) => void;
  isSubmitting: boolean;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("consultant");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;
    onSubmit({ email, name, role });
  };

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setEmail("");
      setName("");
      setRole("consultant");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            Create a user account. They&apos;ll receive a sign-in link via email.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-user-name">Full Name</Label>
            <Input
              id="add-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., John Smith"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-user-email">Email Address</Label>
            <Input
              id="add-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., john@company.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-user-role">Role</Label>
            <select
              id="add-user-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <GatedButton
              type="submit"
              gated={!email || !name}
              gatedReason={!email && !name ? "Enter the user's name and email." : !email ? "Enter the user's email." : "Enter the user's name."}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create & Send Link"}
            </GatedButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
      role === "admin" || role === "platform_admin"
        ? "bg-purple-100 text-purple-700"
        : role === "consultant"
          ? "bg-blue-100 text-blue-700"
          : "bg-slate-100 text-slate-600"
    }`}>
      {ROLE_LABELS[role as UserRole] ?? role.replace("_", " ")}
    </span>
  );
}

function RoleSelect({ currentRole, onSelect, disabled }: { currentRole: string; onSelect: (role: string) => void; disabled: boolean }) {
  return (
    <select
      value={currentRole}
      onChange={(e) => {
        if (e.target.value !== currentRole) {
          onSelect(e.target.value);
        }
      }}
      disabled={disabled}
      className="text-xs border rounded px-2 py-1 bg-transparent focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
    >
      {Object.entries(ROLE_LABELS).map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  );
}
