# API Hub canonical vs heuristic — delta report

**Generated:** 2026-05-03T08:14:05.368Z
**Source:** api.sap.com — SAPS4HANACloudPrivateEdition / odatav4
**Fetched:** 2026-05-03T08:07:03.259Z by S-User S0025693350

## Canonical 424

| Metric | Count |
|---|--:|
| Canonical APIs (file) | 424 |
| Already in DB | 424 |
| Net-new (inserted) | 0 |
| Existing rows retagged to canonical | 424 |
| Heuristic mis-tags cleared | 5 |

## Status breakdown (canonical)

- Released: 394
- Deprecated: 30

## apiId pattern breakdown (canonical)

- OP_: 267
- sap-s4-: 143
- IS_: 9
- SAP_ICSM_: 5

## Heuristic mis-tags cleared (samples, max 10)

These rows were heuristic-tagged `apiType=ODATAV4 AND appliesToPrivate=true`
by the earlier `refresh-api-types.ts` pass but are NOT in the canonical
S/4HANA Cloud Private Edition OData V4 list. Their `apiType` has been
cleared to NULL — they may still be valid OData v4 APIs, just for a
different edition (Public, On-Prem, or industry add-on).

- `OP_A_LGLCNTNTMACCESSLVL_CDS_0001`
- `OP_A_SUPPLIEROPLSCORESAV_CDS_0001`
- `OP_A_TRSYPOSFLOW_CDS_0001`
- `OP_C_BEHQUEUEDATA_CDS_0001`
- `OP_A_TRSYPOSTGJRNLENTRITM_CDS_0001`

## Final state

- `apiType=ODATAV4 AND appliesToPrivate=true`: **424** rows
- of which `status=Released`: **394** rows

## Provenance

The endpoint discovered by chrome-claude:

```
GET https://api.sap.com/api/1.0/container/SAPS4HANACloudPrivateEdition/artifacts
    ?containerType=product
    &$filter=Type eq 'API' and SubType eq 'ODATAV4'
    &$orderby=ModifiedAt desc
    &$top=1000
```

Returns 424 results in a single call — the SPA's "17 pages of 25" was
just UI pagination over this single dataset. Status mapping: ACTIVE →
`Released`, DEPRECATED → `Deprecated`. No BETA values for this product.

The list endpoint does NOT return `rawProductCategory` or
`scopeItemCodes` — those would require either a different content-package
endpoint or scraping each `/api/<id>/overview` page individually. Both
fields stay null/empty for these rows. Not load-bearing for the brownfield
classifier.

