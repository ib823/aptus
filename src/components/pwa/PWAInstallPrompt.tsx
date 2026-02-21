"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DownloadIcon, WifiOffIcon, BellIcon, SmartphoneIcon } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const handleBeforeInstallPrompt = useCallback((e: Event) => {
    e.preventDefault();
    setDeferredPrompt(e as BeforeInstallPromptEvent);
    setShowDialog(true);
  }, []);

  useEffect(() => {
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [handleBeforeInstallPrompt]);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
    setShowDialog(false);
  }

  function handleDismiss() {
    setShowDialog(false);
  }

  const features = [
    { icon: WifiOffIcon, label: "Work offline with sync support" },
    { icon: BellIcon, label: "Push notifications for updates" },
    { icon: SmartphoneIcon, label: "Native-like mobile experience" },
  ];

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DownloadIcon className="size-5" />
            Install Aptus
          </DialogTitle>
          <DialogDescription>
            Install Aptus on your device for a faster, more reliable experience.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3 py-2">
          {features.map(({ icon: FeatureIcon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm">
              <FeatureIcon className="text-muted-foreground size-4 shrink-0" />
              <span>{label}</span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss}>
            Not now
          </Button>
          <Button onClick={handleInstall}>
            Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
