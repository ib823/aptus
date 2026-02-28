"use client";

import { useEffect, useState, useCallback } from "react";
import { SignOffProgressTracker } from "./SignOffProgressTracker";
import { AreaValidationCard } from "./AreaValidationCard";
import { TechnicalValidationPanel } from "./TechnicalValidationPanel";
import { SignatureDisplay } from "./SignatureDisplay";
import { SnapshotCard } from "./SnapshotCard";
import { DataIntegrityBadge } from "./DataIntegrityBadge";
import type { SignOffStatus } from "@/types/signoff";

interface SignOffData {
  id: string;
  status: string;
  verificationToken: string | null;
  certificateHash: string | null;
  certificatePdfUrl: string | null;
  completedAt: string | null;
  snapshot: {
    version: number;
    dataHash: string;
    createdAt: string;
  };
  areaValidations: Array<{
    id: string;
    functionalArea: string;
    status: string;
    validatedByName: string | null;
    comments: string | null;
  }>;
  technicalValidation: {
    id: string;
    itLeadStatus: string;
    itLeadName: string | null;
    dmLeadStatus: string;
    dmLeadName: string | null;
  } | null;
  crossFuncValidation: {
    id: string;
    status: string;
    validatorName: string | null;
    conflictsReviewed: boolean;
    conflictCount: number;
    conflictsResolved: number;
  } | null;
  signatures: Array<{
    id: string;
    signatureType: string;
    signerName: string;
    signerEmail: string;
    signerRole: string;
    signerOrganization: string;
    signerTitle: string | null;
    authorityStatement: string;
    documentHash: string;
    signedAt: string;
    mfaVerified: boolean;
    status: string;
  }>;
}

interface SnapshotItem {
  id: string;
  version: number;
  label: string | null;
  dataHash: string;
  reason: string;
  createdAt: string;
}

interface SignOffDashboardClientProps {
  assessmentId: string;
}

export function SignOffDashboardClient({ assessmentId }: SignOffDashboardClientProps) {
  const [signOff, setSignOff] = useState<SignOffData | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [signOffRes, snapshotsRes] = await Promise.all([
        fetch(`/api/assessments/${assessmentId}/sign-off`),
        fetch(`/api/assessments/${assessmentId}/snapshots`),
      ]);

      if (snapshotsRes.ok) {
        const snapshotJson = await snapshotsRes.json() as { data: SnapshotItem[] };
        setSnapshots(snapshotJson.data);
      }

      if (signOffRes.ok) {
        const signOffJson = await signOffRes.json() as { data: SignOffData };
        setSignOff(signOffJson.data);
      } else if (signOffRes.status === 404) {
        setSignOff(null);
      }
    } catch {
      setError("Failed to load sign-off data");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleInitiateSignOff = async (snapshotVersion: number) => {
    setActionLoading(true);
    try {
      const snapshot = snapshots.find(s => s.version === snapshotVersion);
      if (!snapshot) return;

      const res = await fetch(`/api/assessments/${assessmentId}/sign-off/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snapshot.id }),
      });

      if (res.ok) {
        await fetchData();
      } else {
        const json = await res.json() as { error?: { message?: string } };
        setError(json.error?.message ?? "Failed to start sign-off");
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateSnapshot = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Sign-off preparation", label: `Snapshot v${snapshots.length + 1}` }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="h-32 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="border border-red-200 bg-red-50 rounded-lg p-4 text-red-800">
          {error}
        </div>
      </div>
    );
  }

  // No sign-off process yet
  if (!signOff) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Assessment Sign-Off</h1>

        <div className="border rounded-lg p-6 text-center space-y-4">
          <p className="text-muted-foreground">
            No sign-off process has been initiated yet.
            Create a snapshot and start the sign-off workflow.
          </p>

          {snapshots.length === 0 ? (
            <button
              onClick={() => void handleCreateSnapshot()}
              disabled={actionLoading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {actionLoading ? "Creating..." : "Create Snapshot"}
            </button>
          ) : (
            <div className="space-y-4">
              <h3 className="font-medium">Available Snapshots</h3>
              <div className="grid gap-3 max-w-lg mx-auto">
                {snapshots.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3">
                    <SnapshotCard
                      version={s.version}
                      label={s.label ?? undefined}
                      dataHash={s.dataHash}
                      createdAt={s.createdAt}
                      reason={s.reason}
                    />
                    <button
                      onClick={() => void handleInitiateSignOff(s.version)}
                      disabled={actionLoading}
                      className="shrink-0 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
                    >
                      Start Sign-Off
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const executiveSignature = signOff.signatures.find(s => s.signatureType === "EXECUTIVE" && s.status === "COMPLETED");
  const partnerSignature = signOff.signatures.find(s => s.signatureType === "PARTNER" && s.status === "COMPLETED");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Assessment Sign-Off</h1>
        {signOff.completedAt && (
          <span className="text-sm bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium">
            Completed
          </span>
        )}
      </div>

      {/* Progress tracker */}
      <SignOffProgressTracker currentStatus={signOff.status as SignOffStatus} />

      {/* Snapshot info */}
      <div className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-2">Snapshot</h2>
        <div className="flex items-center gap-4 text-sm">
          <span>Version {signOff.snapshot.version}</span>
          <DataIntegrityBadge isVerified hash={signOff.snapshot.dataHash} />
          <span className="text-muted-foreground">
            Created {new Date(signOff.snapshot.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {/* Area Validations */}
      {signOff.areaValidations.length > 0 && (
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Area Validations</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {signOff.areaValidations.map((av) => (
              <AreaValidationCard
                key={av.id}
                functionalArea={av.functionalArea}
                status={av.status}
                validatorName={av.validatedByName ?? undefined}
                comments={av.comments ?? undefined}
                readOnly
              />
            ))}
          </div>
        </div>
      )}

      {/* Technical Validation */}
      {signOff.technicalValidation && (
        <TechnicalValidationPanel
          itLead={{
            name: signOff.technicalValidation.itLeadName ?? undefined,
            status: signOff.technicalValidation.itLeadStatus,
          }}
          dmLead={{
            name: signOff.technicalValidation.dmLeadName ?? undefined,
            status: signOff.technicalValidation.dmLeadStatus,
          }}
        />
      )}

      {/* Cross-Functional Validation */}
      {signOff.crossFuncValidation && (
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Cross-Functional Validation</h2>
          <div className="text-sm space-y-1">
            <p>Status: <span className="font-medium">{signOff.crossFuncValidation.status}</span></p>
            {signOff.crossFuncValidation.validatorName && (
              <p>Validator: {signOff.crossFuncValidation.validatorName}</p>
            )}
            <p>Conflicts Reviewed: {signOff.crossFuncValidation.conflictsReviewed ? "Yes" : "No"}</p>
            <p>Conflicts: {signOff.crossFuncValidation.conflictsResolved} / {signOff.crossFuncValidation.conflictCount} resolved</p>
          </div>
        </div>
      )}

      {/* Signatures */}
      <div className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">Digital Signatures</h2>
        <div className="space-y-4">
          {executiveSignature ? (
            <SignatureDisplay
              signatureType={executiveSignature.signatureType}
              signerName={executiveSignature.signerName}
              signerEmail={executiveSignature.signerEmail}
              signerRole={executiveSignature.signerRole}
              signerOrganization={executiveSignature.signerOrganization}
              signerTitle={executiveSignature.signerTitle ?? undefined}
              authorityStatement={executiveSignature.authorityStatement}
              documentHash={executiveSignature.documentHash}
              signedAt={executiveSignature.signedAt}
              mfaVerified={executiveSignature.mfaVerified}
              status={executiveSignature.status}
            />
          ) : (
            <div className="border rounded p-3 text-sm text-muted-foreground">
              Executive sign-off pending
            </div>
          )}

          {partnerSignature ? (
            <SignatureDisplay
              signatureType={partnerSignature.signatureType}
              signerName={partnerSignature.signerName}
              signerEmail={partnerSignature.signerEmail}
              signerRole={partnerSignature.signerRole}
              signerOrganization={partnerSignature.signerOrganization}
              signerTitle={partnerSignature.signerTitle ?? undefined}
              authorityStatement={partnerSignature.authorityStatement}
              documentHash={partnerSignature.documentHash}
              signedAt={partnerSignature.signedAt}
              mfaVerified={partnerSignature.mfaVerified}
              status={partnerSignature.status}
            />
          ) : (
            <div className="border rounded p-3 text-sm text-muted-foreground">
              Partner countersign pending
            </div>
          )}
        </div>
      </div>

      {/* Certificate */}
      {signOff.status === "COMPLETED" && signOff.certificateHash && (
        <div className="border rounded-lg p-4 bg-green-50">
          <h2 className="text-lg font-semibold mb-2">Sign-Off Certificate</h2>
          <div className="text-sm space-y-2">
            <p>Certificate Hash: <span className="font-mono text-xs text-slate-400">{signOff.certificateHash.substring(0, 24)}...</span></p>
            {signOff.verificationToken && (
              <p>
                <a
                  href={`/verify/${signOff.verificationToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View Public Verification Page
                </a>
              </p>
            )}
            {signOff.certificatePdfUrl && (
              <a
                href={signOff.certificatePdfUrl}
                download="sign-off-certificate.pdf"
                className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm"
              >
                Download Certificate PDF
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
