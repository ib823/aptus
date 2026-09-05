# SAP S/4HANA Cloud 2608 (SAP Cloud ERP) — Malaysia content drop

The landed 2608 reference files (WS0, `docs/2608/BUILD-LOG.md`). Everything the
2608 workstreams import reads from here, so this folder is **committed** unlike
the rest of `sap-references/` (carve-out in `.gitignore`).

| File | What it is |
|---|---|
| `MANIFEST.json` | The consultant's download record: file, bytes, sha256, source, downloaded date — plus structural `rows`/`sheets` per workbook, written by recon. |
| `RELEASE.json` | The release version record: release `2608`, supersedes `2602`, localisation `MY`, status, the manifest's sha256, and the last RECON facts. `SapContentRelease.manifestHash` in the database is this sha256. |
| `Availability_Dependencies_EN_XX.xlsx` | Scope items (sheet `Scope`, 679 IDs) + `Retired Scope Items`. |
| `SSCUI_List_EN_XX.xlsm` | Self-service configuration UIs (sheet `2608`, 4,328 activity IDs). |
| `BP_CLD_ENTPR_2608_Process-Steps_EN_XX.xlsx` | Process steps (sheet `Scope`, 19,158 rows, 661 items). |
| `S4H_* …xlsx` | 16 BDC questionnaires (incl. the new S4H_706 Process Automation) + S4H_1613 Two-Tier scope questionnaire. |
| `bpd-fts/` | 2608 BPD test scripts, docx + xlsx, for 1IQ 1NT 2ET BD9 BDG BDW J45 J59 J60. |
| master data / org data / YCOA / forms / tax codes / FYV | Malaysia localisation accelerators. |

## Rules

- **Unpacked only.** Zips are ignored by git and fail recon. The two SAP content
  zips (~170 MB) stay in the OneDrive folder on purpose.
- **MANIFEST.json is the record; RELEASE.json is the version.** A file is either
  in `MANIFEST.json` with a matching sha256, or it is not landed. Nothing here
  is invented from memory.
- **Where the files are read from is code, not convention:**
  `scripts/lib/sap-content-sources.ts` (paths, sheets, header rows per release)
  behind `SAP_CONTENT_RELEASE` (`src/lib/sap-content/release.ts`, default 2602).

## Recon

```bash
pnpm sap:2608:recon            # integrity + facts; exit 1 on any finding
pnpm sap:2608:recon --write    # refresh MANIFEST rows/sheets + RELEASE.json
pnpm sap:2608:recon --json     # machine-readable
pnpm sap:2608:seed-release     # upsert the SapContentRelease row (refuses on a red recon)
```

Facts recon checks (±1 % on counts): 679 scope items with the 13 new present and
the 6 obsolete absent · 4,328 SSCUI IDs · 19,158 process-step rows / 661 items ·
16 BDC + S4H_1613 · 9 BPD pairs. `tests/unit/sap-content/manifest-2608.test.ts`
runs the integrity half in CI.

Re-drop policy: when a file changes, re-run `--write`, bump `releaseVersion`
(`2608.0 → 2608.1`) in `RELEASE.json` by hand, and log the diff recon printed.
