"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SignatureDisplayProps {
  signatureType: string;
  signerName: string;
  signerEmail: string;
  signerRole: string;
  signerOrganization: string;
  signerTitle?: string | undefined;
  authorityStatement: string;
  signedAt: string;
  mfaVerified: boolean;
  documentHash: string;
  status: string;
  className?: string | undefined;
}

export function SignatureDisplay({
  signatureType,
  signerName,
  signerEmail,
  signerRole,
  signerOrganization,
  signerTitle,
  authorityStatement,
  signedAt,
  mfaVerified,
  documentHash,
  status,
  className,
}: SignatureDisplayProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {signatureType === "EXECUTIVE" ? "Executive Signature" : "Partner Signature"}
          </CardTitle>
          <Badge variant={status === "COMPLETED" ? "default" : "destructive"}>
            {status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-muted-foreground">Name</p>
            <p>{signerName}</p>
          </div>
          <div>
            <p className="font-medium text-muted-foreground">Email</p>
            <p>{signerEmail}</p>
          </div>
          <div>
            <p className="font-medium text-muted-foreground">Role</p>
            <p>{signerRole}</p>
          </div>
          <div>
            <p className="font-medium text-muted-foreground">Organization</p>
            <p>{signerOrganization}</p>
          </div>
          {signerTitle ? (
            <div>
              <p className="font-medium text-muted-foreground">Title</p>
              <p>{signerTitle}</p>
            </div>
          ) : null}
          <div>
            <p className="font-medium text-muted-foreground">MFA Verified</p>
            <Badge variant={mfaVerified ? "default" : "outline"}>
              {mfaVerified ? "Yes" : "No"}
            </Badge>
          </div>
        </div>
        <div>
          <p className="font-medium text-sm text-muted-foreground">Authority Statement</p>
          <p className="text-sm mt-1 rounded-md bg-muted p-3">{authorityStatement}</p>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Signed: {new Date(signedAt).toLocaleString()}</span>
          <span className="font-mono">Hash: {documentHash.substring(0, 16)}...</span>
        </div>
      </CardContent>
    </Card>
  );
}
