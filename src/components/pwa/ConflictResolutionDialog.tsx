"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { SyncConflict } from "@/types/pwa";

type Resolution = "server" | "client";

interface ConflictResolutionDialogProps {
  open?: boolean | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  conflict?: SyncConflict | undefined;
  onResolve?: ((resolution: Resolution, conflict: SyncConflict) => void) | undefined;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function ConflictResolutionDialog({
  open,
  onOpenChange,
  conflict,
  onResolve,
}: ConflictResolutionDialogProps) {
  const [choice, setChoice] = useState<Resolution>("server");

  function handleResolve() {
    if (conflict && onResolve) {
      onResolve(choice, conflict);
    }
    onOpenChange?.(false);
  }

  return (
    <Dialog open={open ?? false} onOpenChange={onOpenChange ?? (() => {})}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sync Conflict</DialogTitle>
          <DialogDescription>
            This item was modified on the server while you were offline. Choose which version to keep.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md border p-3">
            <h5 className="mb-2 text-sm font-medium">Server Version</h5>
            <pre className="text-muted-foreground max-h-32 overflow-auto text-xs">
              {conflict ? formatValue(conflict.serverValue) : ""}
            </pre>
            {conflict && (
              <p className="text-muted-foreground mt-2 text-xs">
                Updated: {new Date(conflict.serverTimestamp).toLocaleString()}
              </p>
            )}
          </div>
          <div className="rounded-md border p-3">
            <h5 className="mb-2 text-sm font-medium">Your Version</h5>
            <pre className="text-muted-foreground max-h-32 overflow-auto text-xs">
              {conflict ? formatValue(conflict.clientValue) : ""}
            </pre>
          </div>
        </div>

        <RadioGroup
          value={choice}
          onValueChange={(v) => setChoice(v as Resolution)}
          className="mt-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="server" id="resolution-server" />
            <Label htmlFor="resolution-server">Keep server version</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="client" id="resolution-client" />
            <Label htmlFor="resolution-client">Keep my version</Label>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>
            Cancel
          </Button>
          <Button onClick={handleResolve}>
            Resolve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
