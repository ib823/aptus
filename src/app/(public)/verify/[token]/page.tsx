/** Public certificate verification page */

import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";

interface VerifyPageProps {
  params: Promise<{ token: string }>;
}

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { token } = await params;

  const signOff = await prisma.signOffProcess.findUnique({
    where: { verificationToken: token },
    include: {
      assessment: {
        select: { companyName: true, industry: true, country: true },
      },
      snapshot: {
        select: { version: true, dataHash: true, createdAt: true },
      },
      signatures: {
        where: { status: "COMPLETED" },
        orderBy: { signedAt: "asc" },
        select: {
          signatureType: true,
          signerName: true,
          signerOrganization: true,
          signerTitle: true,
          documentHash: true,
          signedAt: true,
        },
      },
    },
  });

  if (!signOff) {
    notFound();
  }

  const isCompleted = signOff.status === "COMPLETED";

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">Certificate Verification</h1>
        <p className="text-muted-foreground">SAP Fit Assessment Platform</p>
      </div>

      <div className="border rounded-lg p-6 space-y-6">
        {/* Status badge */}
        <div className="flex justify-center">
          <span
            className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold ${
              isCompleted
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {isCompleted ? "Verified — Sign-Off Complete" : `Status: ${signOff.status.replace(/_/g, " ")}`}
          </span>
        </div>

        {/* Assessment info */}
        <div className="border-t pt-4">
          <h2 className="text-lg font-semibold mb-3">Assessment Details</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Company</dt>
            <dd className="font-medium">{signOff.assessment.companyName}</dd>
            <dt className="text-muted-foreground">Industry</dt>
            <dd>{signOff.assessment.industry ?? "-"}</dd>
            <dt className="text-muted-foreground">Country</dt>
            <dd>{signOff.assessment.country ?? "-"}</dd>
          </dl>
        </div>

        {/* Data integrity */}
        <div className="border-t pt-4">
          <h2 className="text-lg font-semibold mb-3">Data Integrity</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Snapshot Version</dt>
              <dd className="font-mono">{signOff.snapshot.version}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Snapshot Hash (SHA-256)</dt>
              <dd className="font-mono text-xs break-all">{signOff.snapshot.dataHash}</dd>
            </div>
            {signOff.certificateHash && (
              <div>
                <dt className="text-muted-foreground">Certificate Hash</dt>
                <dd className="font-mono text-xs break-all">{signOff.certificateHash}</dd>
              </div>
            )}
            {signOff.completedAt && (
              <div>
                <dt className="text-muted-foreground">Completed</dt>
                <dd>{signOff.completedAt.toLocaleString("en-US")}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Signatures */}
        {signOff.signatures.length > 0 && (
          <div className="border-t pt-4">
            <h2 className="text-lg font-semibold mb-3">Digital Signatures</h2>
            <div className="space-y-3">
              {signOff.signatures.map((sig, i) => (
                <div key={i} className="border rounded p-3 text-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{sig.signerName}</p>
                      <p className="text-muted-foreground">
                        {sig.signerOrganization}
                        {sig.signerTitle ? ` — ${sig.signerTitle}` : ""}
                      </p>
                    </div>
                    <span className="text-xs bg-muted px-2 py-1 rounded">
                      {sig.signatureType === "EXECUTIVE" ? "Executive" : "Partner"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span>Signed: {sig.signedAt.toLocaleString("en-US")}</span>
                    <span className="ml-3 font-mono">Hash: {sig.documentHash.substring(0, 12)}...</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        This verification is provided by the ABeam Assessment Platform.
        The hashes above can be independently verified against the assessment data.
      </p>
    </div>
  );
}
