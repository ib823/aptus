import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/40 px-4 sm:px-6">
      <div className="w-full max-w-md">
        {children}
      </div>
    </main>
  );
}
