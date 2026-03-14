"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="max-w-md text-center space-y-4">
        <WifiOff className="w-12 h-12 text-muted-foreground mx-auto" />
        <h1 className="text-2xl font-semibold tracking-tight">
          You&apos;re offline
        </h1>
        <p className="text-muted-foreground">
          It looks like you&apos;ve lost your internet connection. Any changes
          you made while offline will be synced automatically when you&apos;re
          back online.
        </p>
        <Button onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
