import Link from "next/link";
import type { ReactNode } from "react";
import { ABeamLogo } from "@/components/shared/ABeamLogo";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-12 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2" aria-label="Aptus home">
            <ABeamLogo size="sm" />
            <span className="text-sm font-semibold text-foreground">Aptus</span>
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
