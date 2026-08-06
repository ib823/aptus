-- SapHubContent gains product identity.
--
-- productTags: SAP's verbatim product tag string, same convention as
-- SapApiReference.productTags — what makes non-edition products
-- (SuccessFactors, Ariba) addressable by a catalogue read. Until now every
-- imported row was stamped appliesToPublic=true regardless of its real
-- product, and the read paths filtered on that flag alone, so every
-- connection type rendered the S/4 Public catalogue.
--
-- The two new edition indexes serve the edition-aware reads that replace the
-- hardcoded appliesToPublic filter (private/on-prem catalogue queries).

ALTER TABLE "SapHubContent" ADD COLUMN "productTags" TEXT;

CREATE INDEX "SapHubContent_appliesToPrivate_idx" ON "SapHubContent"("appliesToPrivate");
CREATE INDEX "SapHubContent_appliesToOnPrem_idx" ON "SapHubContent"("appliesToOnPrem");
