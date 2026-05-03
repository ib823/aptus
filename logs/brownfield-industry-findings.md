# Industry-Specific Conversion Guides — Forensic Findings

**Probed:** 2026-05-03T07:46:35.186Z
**Probed-from:** Aptus codespace (no SAP user credentials)

## Per-industry probe results

| Industry | help.sap.com landing | Body bytes | Conv-doc links visible | Status | SIC items (inline) |
|---|---|--:|--:|---|--:|
| Banking | [BANKING_SERVICES_FOR_SAP_S_4HANA](https://help.sap.com/docs/BANKING_SERVICES_FOR_SAP_S_4HANA) | 635 | 0 | 🔒 Auth-gated | 8 |
| Insurance | [SAP_INSURANCE_FOR_S_4HANA](https://help.sap.com/docs/SAP_INSURANCE_FOR_S_4HANA) | 635 | 0 | 🔒 Auth-gated | 35 |
| Public Sector | [S4HANA_PSCD_PUBLIC_SECTOR](https://help.sap.com/docs/S4HANA_PSCD_PUBLIC_SECTOR) | 635 | 0 | 🔒 Auth-gated | 12 |
| Oil & Gas | [SAP_S4HANA_OIL_GAS](https://help.sap.com/docs/SAP_S4HANA_OIL_GAS) | 635 | 0 | 🔒 Auth-gated | 27 |
| Utilities | [SAP_S4HANA_UTILITIES](https://help.sap.com/docs/SAP_S4HANA_UTILITIES) | 140 | 0 | 🔒 Auth-gated | 26 |
| Retail & Fashion | [SAP_S4HANA_RETAIL_FASHION](https://help.sap.com/docs/SAP_S4HANA_RETAIL_FASHION) | 635 | 0 | 🔒 Auth-gated | 69 |
| Automotive | [SAP_AUTOMOTIVE](https://help.sap.com/docs/SAP_AUTOMOTIVE) | 635 | 0 | 🔒 Auth-gated | 16 |
| Media | [SAP_S4HANA_MEDIA](https://help.sap.com/docs/SAP_S4HANA_MEDIA) | 635 | 0 | 🔒 Auth-gated | 2 |
| Telecommunications | [SAP_S4HANA_TELECOMMUNICATIONS](https://help.sap.com/docs/SAP_S4HANA_TELECOMMUNICATIONS) | 635 | 0 | 🔒 Auth-gated | 2 |

## Verdict

All 9 probed industry product pages on `help.sap.com` rendered the same
~635-byte generic shell (cookie banner + portal chrome) without any
industry-specific content visible to an unauthenticated session. The
"Conversion to SAP Transactional Banking for SAP S/4HANA" PDF (chrome-claude
manifest item #16), and equivalent industry-specific conversion guide PDFs,
are gated behind help.sap.com authentication.

**However**, industry-specific simplification items ARE already ingested
via the master SIC archive (`SimplificationItemCatalog20260503.zip`),
which is public. The cross-reference above shows how many SImplification
Items in our DB are tagged with each industry's `applicationArea`.

## Forensic-green disposition

For brownfield assessments scoped to a specific industry:

- ✅ **Industry-tagged simplification items** — query `SimplificationItem`
  where `applicationArea` matches the industry tag. Coverage shown above.
- 🔒 **Industry-specific conversion guide PDFs** — deferred until either
  (a) S-User credentials are available in the codespace, or (b) the
  customer/partner provides the PDFs out-of-band for direct ingest via
  `brownfield-pdf-guide-adapter.ts --industry-tag <TAG>`.

For TT dotCom (Telecommunications) specifically, the master SIC
contains 2 items tagged
`Industry Telecommunications` — those apply directly to their conversion.
