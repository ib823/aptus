/** Service worker registration utility */

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
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
