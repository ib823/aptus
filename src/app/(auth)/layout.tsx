import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Sign In" };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 sm:px-6"
      style={{ background: "var(--sapBackgroundColor, #f5f6f7)" }}
    >
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
