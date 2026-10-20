-- Interface: carry the customer's OWN OData service path (Z* RAP services,
-- YY1_* key-user CDS views, ECC Gateway services, SuccessFactors /odata/v2).
--
-- The broker could only call a service it resolved from a product's curated
-- list or an SAP-published catalogue row, so an interface for a service the
-- customer built saved and then answered 400 on every call, and ECC (no
-- curated services, no catalogue scope) could never be called at all. An
-- interface may now name its own service root, a path on the connection's
-- host, with its OData version. The verification columns record the last
-- SUCCESSFUL live $metadata check of the current contract; writes through a
-- custom service are refused while it is null.
--
-- Generated with `prisma migrate diff`. Additive; existing rows read null =
-- catalogue interface, unverified.
ALTER TABLE "Interface" ADD COLUMN     "odataVersion" TEXT,
ADD COLUMN     "servicePath" TEXT,
ADD COLUMN     "serviceVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "serviceVerifiedEntitySets" JSONB,
ADD COLUMN     "serviceVerifiedEnvironment" TEXT;
