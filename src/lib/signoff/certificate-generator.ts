/** Sign-off certificate PDF generator */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { type BrandingConfig, DEFAULT_BRANDING, hexToRgb } from "@/lib/report/branding";

interface SignatureInfo {
  signatureType: "EXECUTIVE" | "PARTNER";
  signerName: string;
  signerEmail: string;
  signerRole: string;
  signerOrganization: string;
  signerTitle: string | null;
  documentHash: string;
  signedAt: Date;
}

interface CertificateInput {
  assessmentId: string;
  companyName: string;
  industry: string;
  country: string;
  snapshotVersion: number;
  snapshotHash: string;
  certificateHash: string;
  verificationToken: string;
  completedAt: Date;
  signatures: SignatureInfo[];
  statistics: {
    totalScopeItems: number;
    selectedScopeItems: number;
    totalSteps: number;
    fitCount: number;
    gapCount: number;
    totalGapResolutions: number;
    approvedGapResolutions: number;
    integrationPointCount: number;
    dataMigrationObjectCount: number;
  };
}

function resolveColor(branding: BrandingConfig, key: "primaryColor" | "secondaryColor"): [number, number, number] {
  const { r, g, b } = hexToRgb(branding[key]);
  return [r, g, b];
}

export function generateSignOffCertificatePdf(
  input: CertificateInput,
  branding?: BrandingConfig | undefined,
): Uint8Array {
  const b = branding ?? DEFAULT_BRANDING;
  const primary = resolveColor(b, "primaryColor");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  // --- Decorative header ---
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, pw, 55, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.text("Certificate of Sign-Off", pw / 2, 28, { align: "center" });
  doc.setFontSize(12);
  doc.text("SAP Fit Assessment Completion", pw / 2, 40, { align: "center" });
  doc.setFontSize(9);
  doc.text(b.companyName ?? "Aptus Assessment Platform", pw / 2, 50, { align: "center" });

  // --- Certificate body ---
  let y = 70;
  doc.setTextColor(55, 65, 81);
  doc.setFontSize(11);
  doc.text("This certifies that the SAP Fit Assessment for", pw / 2, y, { align: "center" });

  y += 12;
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.setFontSize(22);
  doc.text(input.companyName, pw / 2, y, { align: "center" });

  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.text(`${input.industry} | ${input.country}`, pw / 2, y, { align: "center" });

  y += 10;
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);
  doc.text(
    "has been validated, reviewed, and signed off by all required parties.",
    pw / 2,
    y,
    { align: "center" },
  );

  // --- Assessment Summary ---
  y += 15;
  doc.setFontSize(13);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text("Assessment Summary", 20, y);
  y += 8;

  const stats = input.statistics;
  const fitRate = stats.totalSteps > 0 ? Math.round((stats.fitCount / stats.totalSteps) * 100) : 0;

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Scope Items (Selected / Total)", `${stats.selectedScopeItems} / ${stats.totalScopeItems}`],
      ["Process Steps", String(stats.totalSteps)],
      ["Fit Rate", `${fitRate}%`],
      ["Gaps Identified", String(stats.gapCount)],
      ["Gap Resolutions (Approved / Total)", `${stats.approvedGapResolutions} / ${stats.totalGapResolutions}`],
      ["Integration Points", String(stats.integrationPointCount)],
      ["Data Migration Objects", String(stats.dataMigrationObjectCount)],
    ],
    theme: "grid",
    headStyles: { fillColor: primary },
    margin: { left: 30, right: 30 },
    styles: { fontSize: 9 },
  });

  const d = doc as unknown as { previousAutoTable?: { finalY?: number } };
  y = (d.previousAutoTable?.finalY ?? y + 60) + 12;

  // --- Signatures ---
  doc.setFontSize(13);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text("Digital Signatures", 20, y);
  y += 8;

  const sigRows = input.signatures.map((sig) => [
    sig.signatureType === "EXECUTIVE" ? "Executive Sign-Off" : "Partner Countersign",
    sig.signerName,
    sig.signerOrganization,
    sig.signerTitle ?? "-",
    sig.signedAt instanceof Date ? sig.signedAt.toLocaleDateString("en-US") : String(sig.signedAt),
    sig.documentHash.substring(0, 12) + "...",
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Type", "Signer", "Organization", "Title", "Date", "Hash"]],
    body: sigRows,
    theme: "grid",
    headStyles: { fillColor: primary },
    margin: { left: 20, right: 20 },
    styles: { fontSize: 8 },
    columnStyles: {
      5: { fontStyle: "italic", fontSize: 7 },
    },
  });

  y = ((doc as unknown as { previousAutoTable?: { finalY?: number } }).previousAutoTable?.finalY ?? y + 30) + 12;

  // --- Data Integrity ---
  if (y > 220) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(13);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  doc.text("Data Integrity", 20, y);
  y += 8;

  doc.setFontSize(9);
  doc.setTextColor(55, 65, 81);
  const integrityLines = [
    `Snapshot Version: ${input.snapshotVersion}`,
    `Snapshot Hash (SHA-256): ${input.snapshotHash}`,
    `Certificate Hash (SHA-256): ${input.certificateHash}`,
    `Completed: ${input.completedAt instanceof Date ? input.completedAt.toISOString() : String(input.completedAt)}`,
  ];
  for (const line of integrityLines) {
    doc.text(line, 20, y);
    y += 6;
  }

  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(
    `Verification Token: ${input.verificationToken}`,
    20,
    y,
  );

  // --- Footer ---
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `${b.footerText} — ${new Date().toLocaleDateString("en-US")}`,
    pw / 2,
    ph - 10,
    { align: "center" },
  );

  return new Uint8Array(doc.output("arraybuffer"));
}
