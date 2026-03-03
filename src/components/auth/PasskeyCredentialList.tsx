"use client";

import { useState, useEffect, useCallback } from "react";
import { KeyRound, Trash2, Pencil, Check, X, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Credential {
  id: string;
  credentialId: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
}

export function PasskeyCredentialList() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCredentials = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/webauthn/credentials");
      if (res.ok) {
        const { data } = await res.json();
        setCredentials(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  const handleRename = useCallback(
    async (credentialId: string) => {
      if (!editName.trim()) return;
      try {
        const res = await fetch(`/api/auth/webauthn/credentials/${credentialId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceName: editName.trim() }),
        });
        if (res.ok) {
          toast.success("Passkey renamed");
          setEditingId(null);
          fetchCredentials();
        } else {
          toast.error("Failed to rename passkey");
        }
      } catch {
        toast.error("Failed to rename passkey");
      }
    },
    [editName, fetchCredentials],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/auth/webauthn/credentials/${deleteTarget.credentialId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        toast.success("Passkey removed");
        setDeleteTarget(null);
        fetchCredentials();
      } else {
        toast.error("Failed to remove passkey");
      }
    } catch {
      toast.error("Failed to remove passkey");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchCredentials]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading passkeys...
      </div>
    );
  }

  if (credentials.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No passkeys registered. Add one to enable faster sign-in.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {credentials.map((cred) => (
          <div
            key={cred.id}
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <KeyRound className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                {editingId === cred.credentialId ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-7 text-sm w-40"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(cred.credentialId);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleRename(cred.credentialId)}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate" title={cred.deviceName ?? "Passkey"}>
                      {cred.deviceName ?? "Passkey"}
                    </span>
                    {cred.backedUp && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        <ShieldCheck className="w-3 h-3 mr-1" />
                        Synced
                      </Badge>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Added {new Date(cred.createdAt).toLocaleDateString()}
                  {cred.lastUsedAt &&
                    ` · Last used ${new Date(cred.lastUsedAt).toLocaleDateString()}`}
                </p>
              </div>
            </div>
            {editingId !== cred.credentialId && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditingId(cred.credentialId);
                    setEditName(cred.deviceName ?? "");
                  }}
                  aria-label="Rename passkey"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(cred)}
                  aria-label="Delete passkey"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove passkey</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove &ldquo;{deleteTarget?.deviceName ?? "Passkey"}&rdquo;?
              You won&apos;t be able to sign in with this passkey anymore.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
