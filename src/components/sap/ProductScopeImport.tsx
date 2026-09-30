"use client";

import { useState } from "react";
import { parseProductScopeManifest, type ProductScopeRecord } from "@/lib/product-scope/manifest";

const CHUNK_SIZE = 50;

export function ProductScopeImport() {
  const [records, setRecords] = useState<ProductScopeRecord[]>([]);
  const [fileName, setFileName] = useState("");
  const [expectedCount, setExpectedCount] = useState("");
  const [imported, setImported] = useState(0);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadFile(file: File | undefined) {
    setRecords([]);
    setFileName(file?.name ?? "");
    setImported(0);
    setStatus("");
    if (!file) return;
    try {
      const parsed = parseProductScopeManifest(JSON.parse(await file.text()));
      if (parsed.some((record) => record.visibility !== "ABEAM_ADMIN")) {
        throw new Error("All browser-imported records must be ABeam-admin-only");
      }
      setRecords(parsed);
      setStatus(`${parsed.length} validated records ready. Compare this with SAP's source count before importing.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Manifest invalid: ${error.message}` : "Manifest invalid");
    }
  }

  async function importRecords() {
    const sourceCount = Number(expectedCount);
    if (!Number.isSafeInteger(sourceCount) || sourceCount < 1 || sourceCount !== records.length) {
      setStatus("Enter SAP's source count. It must match the validated manifest record count.");
      return;
    }
    setBusy(true);
    setImported(0);
    setStatus("Importing and verifying records in batches...");
    try {
      for (let offset = 0; offset < records.length; offset += CHUNK_SIZE) {
        const batch = records.slice(offset, offset + CHUNK_SIZE);
        const response = await fetch("/api/admin/product-scope/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch),
        });
        const result = await response.json() as { error?: string; imported?: number; verified?: number };
        if (!response.ok || result.imported !== batch.length || result.verified !== batch.length) {
          throw new Error(result.error ?? `Batch starting at ${offset + 1} was not verified`);
        }
        setImported(offset + batch.length);
      }
      setStatus(`All ${records.length} manifest records imported and verified. Compare product and release coverage with SAP before claiming the overall inventory is complete.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Import stopped: ${error.message}. Correct the issue and retry; completed batches are safe to repeat.` : "Import stopped");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-5 rounded-xl border border-[var(--border-default)] bg-white p-5">
    <p className="text-sm text-[var(--ink-secondary)]">Choose a reviewed SAP manifest JSON file. The browser sends records only to this Aptus deployment; the source file is not added to the public repository.</p>
    <label className="block text-sm font-medium">Manifest file
      <input type="file" accept=".json,application/json" disabled={busy}
        onChange={(event) => void loadFile(event.target.files?.[0])}
        className="mt-2 block w-full rounded-lg border border-[var(--border-default)] p-2" />
    </label>
    {fileName && <p className="text-sm">{fileName} · {records.length} validated records · {records.filter((record) => record.visibility === "ABEAM_ADMIN").length} ABeam only</p>}
    <label className="block text-sm font-medium">Record count shown by the selected SAP source
      <input type="number" min="1" step="1" value={expectedCount} disabled={busy}
        onChange={(event) => setExpectedCount(event.target.value)}
        className="mt-2 block w-36 rounded-lg border border-[var(--border-default)] px-3 py-2" />
    </label>
    <button type="button" onClick={() => void importRecords()} disabled={busy || records.length === 0}
      className="rounded-lg bg-[var(--brand-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
      {busy ? `Importing ${imported}/${records.length}` : "Import and verify"}
    </button>
    {status && <p role="status" className="text-sm text-[var(--ink-secondary)]">{status}</p>}
  </div>;
}
