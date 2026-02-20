import { Shield, ShieldCheck } from "lucide-react";

interface MfaStatusBadgeProps {
  enabled: boolean;
  className?: string;
}

export function MfaStatusBadge({ enabled, className = "" }: MfaStatusBadgeProps) {
  if (enabled) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium text-green-700 ${className}`}
      >
        <ShieldCheck className="w-3.5 h-3.5" />
        MFA Enabled
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium text-gray-400 ${className}`}
    >
      <Shield className="w-3.5 h-3.5" />
      MFA Not Set Up
    </span>
  );
}
