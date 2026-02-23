"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
          }}
        >
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
              Something went wrong
            </h1>
            <p style={{ color: "#666", marginTop: "0.5rem" }}>
              An unexpected error occurred. Our team has been notified.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: "1rem",
                padding: "0.5rem 1.5rem",
                borderRadius: 6,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
