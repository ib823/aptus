"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ValidationStatusBadge } from "./ValidationStatusBadge";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface AreaValidationCardProps {
  functionalArea: string;
  validatorName?: string | undefined;
  status: string;
  comments?: string | undefined;
  rejectionReason?: string | undefined;
  onApprove?: ((comments: string) => void) | undefined;
  onReject?: ((reason: string) => void) | undefined;
  readOnly?: boolean | undefined;
  className?: string | undefined;
}

export function AreaValidationCard({
  functionalArea,
  validatorName,
  status,
  comments,
  rejectionReason,
  onApprove,
  onReject,
  readOnly,
  className,
}: AreaValidationCardProps) {
  const [inputText, setInputText] = useState("");

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{functionalArea}</CardTitle>
          <ValidationStatusBadge status={status} />
        </div>
        {validatorName ? (
          <p className="text-sm text-muted-foreground">Validator: {validatorName}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {comments ? (
          <p className="mb-3 text-sm text-muted-foreground">
            <span className="font-medium">Comments:</span> {comments}
          </p>
        ) : null}
        {rejectionReason ? (
          <p className="mb-3 text-sm text-red-600 dark:text-red-400">
            <span className="font-medium">Rejection Reason:</span> {rejectionReason}
          </p>
        ) : null}
        {!(readOnly ?? false) && status === "PENDING" ? (
          <div className="space-y-3">
            <Textarea
              placeholder="Add comments or rejection reason..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onApprove?.(inputText)}
                className="bg-green-600 hover:bg-green-700"
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onReject?.(inputText)}
                disabled={!inputText}
              >
                Reject
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
