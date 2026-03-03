import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--sapBackgroundColor, #f5f6f7)" }}>
      {children}
    </div>
  );
}
