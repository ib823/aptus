/**
 * Web Push notification service.
 * Uses the web-push library with VAPID keys.
 * Gracefully no-ops if VAPID keys are not configured.
 */

interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PushPayload {
  title: string;
  body: string;
  deepLink?: string | undefined;
  icon?: string | undefined;
}

/**
 * Send a push notification to a single subscription.
 * No-op if VAPID_PRIVATE_KEY is not set.
 */
export async function sendPushNotification(
  subscription: PushSubscriptionData,
  payload: PushPayload,
): Promise<boolean> {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@abeam.app";

  if (!vapidPublicKey || !vapidPrivateKey) {
    // VAPID not configured — skip silently
    return false;
  }

  try {
    // Dynamic import to avoid build errors when web-push is not installed
    const webpush = await import("web-push");

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        data: {
          deepLink: payload.deepLink,
        },
        icon: payload.icon ?? "/icon-192x192.png",
      }),
    );

    return true;
  } catch (error) {
    // 410 Gone means the subscription is expired — caller should clean up
    if (error && typeof error === "object" && "statusCode" in error && error.statusCode === 410) {
      console.warn("[PUSH] Subscription expired:", subscription.endpoint.substring(0, 60));
    } else {
      console.error("[PUSH] Failed to send push notification:", error);
    }
    return false;
  }
}
