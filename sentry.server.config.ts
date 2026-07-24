/** Sentry server-side configuration — no-op when SENTRY_DSN is unset */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Never attach IP/cookies/request bodies by default.
    sendDefaultPii: false,
    // Defense-in-depth scrub: drop auth headers/cookies from any event that
    // still carries request context before it leaves the server.
    beforeSend(event) {
      const headers = event.request?.headers;
      if (headers) {
        for (const name of Object.keys(headers)) {
          const lower = name.toLowerCase();
          if (lower === "authorization" || lower === "cookie" || lower === "x-csrf-token") {
            delete headers[name];
          }
        }
      }
      if (event.request) delete event.request.cookies;
      return event;
    },
  });
}
