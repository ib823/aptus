"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, Clock, CreditCard, X, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SubscriptionStatus } from "@/types/commercial";

interface SubscriptionStatusBannerProps {
  status: SubscriptionStatus;
  trialEndsAt?: string | null | undefined;
  onUpgrade?: (() => void) | undefined;
  onUpdatePayment?: (() => void) | undefined;
  upgradeHref?: string | undefined;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

const BORDER_COLORS: Record<SubscriptionStatus, string> = {
  TRIALING: "border-blue-300 bg-blue-50",
  ACTIVE: "border-green-300 bg-green-50",
  PAST_DUE: "border-amber-300 bg-amber-50",
  CANCELED: "border-slate-300 bg-slate-50",
  TRIAL_EXPIRED: "border-red-300 bg-red-50",
};

const DISMISS_KEY = "aptus-banner-dismissed";

export function SubscriptionStatusBanner({
  status,
  trialEndsAt,
  onUpgrade,
  onUpdatePayment,
  upgradeHref,
}: SubscriptionStatusBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(DISMISS_KEY);
      if (stored === status) setDismissed(true);
    }
  }, [status]);

  if (status === "ACTIVE" || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, status);
  };

  return (
    <Card className={`border-2 ${BORDER_COLORS[status]} relative`}>
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
      <CardContent className="pt-4 pr-8">
        <div className="flex items-start gap-3">
          {status === "TRIALING" ? (
            <>
              <Clock className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-blue-800">Trial Period</p>
                <p className="text-sm text-blue-700 mt-0.5">
                  {trialEndsAt
                    ? `Your trial ends in ${daysUntil(trialEndsAt)} days.`
                    : "You are currently on a trial plan."}
                  {" "}Upgrade to keep access to all features.
                </p>
              </div>
              {(onUpgrade || upgradeHref) ? (
                upgradeHref ? (
                  <Link href={upgradeHref}>
                    <Button size="sm">Upgrade</Button>
                  </Link>
                ) : (
                  <Button size="sm" onClick={onUpgrade}>
                    Upgrade
                  </Button>
                )
              ) : null}
            </>
          ) : status === "PAST_DUE" ? (
            <>
              <CreditCard className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-amber-800">Payment Past Due</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Your payment method needs to be updated to continue your subscription.
                </p>
              </div>
              {onUpdatePayment ? (
                <Button size="sm" variant="outline" onClick={onUpdatePayment}>
                  Update Payment
                </Button>
              ) : null}
            </>
          ) : status === "TRIAL_EXPIRED" ? (
            <>
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-red-800">Trial Expired</p>
                <p className="text-sm text-red-700 mt-0.5">
                  Your trial has expired. Upgrade to a paid plan to regain full access.
                </p>
              </div>
              {(onUpgrade || upgradeHref) ? (
                upgradeHref ? (
                  <Link href={upgradeHref}>
                    <Button size="sm">Upgrade Now</Button>
                  </Link>
                ) : (
                  <Button size="sm" onClick={onUpgrade}>
                    Upgrade Now
                  </Button>
                )
              ) : null}
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-slate-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-slate-700">Subscription Canceled</p>
                <p className="text-sm text-slate-600 mt-0.5">
                  Your subscription has been canceled. Contact support to reactivate.
                </p>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
