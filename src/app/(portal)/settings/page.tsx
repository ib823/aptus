import Link from "next/link";
import { CreditCard, ShieldCheck, Bell } from "lucide-react";

export default function SettingsPage() {
  const links = [
    { label: "Subscription", href: "/settings/subscription", icon: CreditCard, description: "Manage your plan and billing" },
    { label: "Security", href: "/settings/security", icon: ShieldCheck, description: "Passkeys, MFA, and authentication" },
    { label: "Notifications", href: "/settings/notifications", icon: Bell, description: "Email and push notification preferences" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-start gap-3 rounded-lg border p-4 hover:bg-accent transition-colors"
            >
              <Icon className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">{link.label}</p>
                <p className="text-xs text-muted-foreground">{link.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
