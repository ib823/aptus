"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/sw-register";

export function ServiceWorkerProvider() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return null;
}
