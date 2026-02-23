"use client";

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <div className="max-w-md text-center space-y-4">
        <div className="text-6xl">📡</div>
        <h1 className="text-2xl font-bold tracking-tight">
          You&apos;re offline
        </h1>
        <p className="text-muted-foreground">
          It looks like you&apos;ve lost your internet connection. Any changes
          you made while offline will be synced automatically when you&apos;re
          back online.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
