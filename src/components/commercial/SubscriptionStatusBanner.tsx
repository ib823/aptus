"use client";

import { AlertCircle, Clock, CreditCard, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SubscriptionStatus } from "@/types/commercial";

interface SubscriptionStatusBannerProps {
  status: SubscriptionStatus;
  trialEndsAt?: string | null | undefined;
  onUpgrade?: (() => void) | undefined;
  onUpdatePayment?: (() => void) | undefined;
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
  CANCELED: "border-gray-300 bg-gray-50",
  TRIAL_EXPIRED: "border-red-300 bg-red-50",
};

export function SubscriptionStatusBanner({
  status,
  trialEndsAt,
  onUpgrade,
  onUpdatePayment,
}: SubscriptionStatusBannerProps) {
  if (status === "ACTIVE") return null;

  return (
    <Card className={`border-2 ${BORDER_COLORS[status]}`}>
      <CardContent className="pt-4">
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
              {onUpgrade ? (
                <Button size="sm" onClick={onUpgrade}>
                  Upgrade
                </Button>
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
              {onUpgrade ? (
                <Button size="sm" onClick={onUpgrade}>
                  Upgrade Now
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-gray-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-gray-700">Subscription Canceled</p>
                <p className="text-sm text-gray-600 mt-0.5">
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
