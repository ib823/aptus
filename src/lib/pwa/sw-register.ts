/** Service worker registration utility */

const PWA_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PWA === "true";

async function clearAbeamCaches(): Promise<void> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }

  const cacheKeys = await caches.keys();
  await Promise.all(
    cacheKeys
      .filter((key) => key.startsWith("abeam-"))
      .map((key) => caches.delete(key)),
  );
}

async function unregisterExistingServiceWorkers(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => new URL(registration.scope).origin === window.location.origin)
      .map((registration) => registration.unregister()),
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  if (!PWA_ENABLED) {
    await unregisterExistingServiceWorkers();
    await clearAbeamCaches();
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "activated" &&
          navigator.serviceWorker.controller
        ) {
          // New version available — user will get it on next navigation
          console.info("[SW] New version activated");
        }
      });
    });

    return registration;
  } catch (err) {
    console.error("[SW] Registration failed:", err);
    return null;
  }
}
