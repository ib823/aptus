import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Shield, BarChart3 } from "lucide-react";
import { ABeamLogo } from "@/components/shared/ABeamLogo";
import { UI_TEXT } from "@/constants/ui-text";

export const metadata: Metadata = { title: "Sign In" };

function FeatureItem({ icon: Icon, text }: { icon: typeof Shield; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Icon className="h-4.5 w-4.5 text-white/80" />
      </div>
      <span className="text-sm text-white/80 leading-snug">{text}</span>
    </div>
  );
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left branding panel — desktop only */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col justify-between p-12 bg-gradient-to-br from-primary via-primary/95 to-blue-800 text-white">
        {/* Decorative background circles */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full border border-white/[0.06]" />
          <div className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full border border-white/[0.06]" />
          <div className="absolute top-1/2 right-1/4 w-64 h-64 rounded-full border border-white/[0.04]" />
        </div>

        {/* Top: Logo + name */}
        <div className="relative z-10">
          <ABeamLogo size="xl" className="mb-3 brightness-0 invert" />
          <h2 className="text-2xl font-semibold tracking-tight">
            {UI_TEXT.app.name}
          </h2>
          <p className="text-white/60 text-sm mt-1">{UI_TEXT.app.tagline}</p>
        </div>

        {/* Middle: Value proposition */}
        <div className="relative z-10 space-y-6">
          <h3 className="text-xl font-medium leading-relaxed">
            Align your business processes
            <br />
            with SAP best practices
          </h3>
          <div className="space-y-4">
            <FeatureItem icon={BarChart3} text="Compare processes against SAP Best Practices 2602" />
          </div>
        </div>

        {/* Bottom: Copyright */}
        <p className="relative z-10 text-xs text-white/30">
          &copy; {new Date().getFullYear()} Aptus. All rights reserved.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-12 bg-background">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
