# SAP S/4HANA Cloud 2608 — reference drop

Landing zone for the 2608 release files (WS0). Everything the later 2608
workstreams import reads from here, so this folder is **committed**, unlike the
rest of `sap-references/` (see the carve-out in `.gitignore`).

## Rules

- **Unpacked only.** Zips are ignored by git (`/sap-references/2608/**/*.zip`)
  and fail `recon-2608`. Extract before landing.
- **`RELEASE.json` is the version record.** `release` / `releaseVersion` /
  `supersedes` name the SAP release the drop represents; `files[]` is the
  recon baseline (path, bytes, sha256) for every landed file.
- **Nothing is invented.** A file is either in this folder with a hash in
  `RELEASE.json`, or it is not landed. `status` stays `PENDING` until the first
  successful `--write`.

## Landing procedure

```bash
# 1. copy the unpacked contents of "AB Workbench\2608\" into sap-references/2608/
# 2. reconcile the folder against RELEASE.json
pnpm sap:2608:recon            # report only — exits 1 on drift, zips, or an empty drop
pnpm sap:2608:recon --write    # record what is on disk as the new baseline
```

`--write` refreshes `files[]`, `recon.*`, and flips `status` to `LANDED` with a
`landedAt` timestamp. Bump `releaseVersion` (`2608.0` → `2608.1`, …) when a
re-drop changes files; recon prints added / removed / changed so the bump is
justified by the diff it prints, not by memory.
