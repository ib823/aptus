-- 2608 WS11 — the seven landed-but-unread files.
--
-- Eight workbooks shipped in the 2608 drop and no loader had ever opened them.
-- These tables give the catalogue the layers it could not describe: the form a
-- process prints, the org units it runs in, the G/L account it posts to, the
-- cost object it charges, the tax code it applies and the fiscal calendar it
-- closes on.
--
-- Purely additive: eight new tables, their indexes and their release FKs.
-- Nothing existing is altered or dropped, so a rollback is a DROP of these
-- eight and nothing else. releaseId is NOT NULL because these tables are new —
-- no pre-tracking row can exist, unlike the WS0 backfill columns.
--
-- The forms table carries scopeItemCodes as an indexed String[]: the source
-- names every scope item a form belongs to in two columns, and 462 of the 822
-- 2608 scope items have at least one. That is the one published artefact-to-
-- scope-item link in the drop that needed no derivation — it is not going to be
-- collapsed to a first-value column the way SSCUI was before WS9.1.

-- CreateTable
CREATE TABLE "SapFormTemplate" (
    "id" TEXT NOT NULL,
    "applicationArea" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "applicationObject" TEXT NOT NULL,
    "adobeFormTemplate" TEXT NOT NULL,
    "outputType" TEXT NOT NULL,
    "callbackClass" TEXT NOT NULL,
    "relevantFor" TEXT NOT NULL DEFAULT 'All',
    "scopeItemCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawUse" TEXT,
    "rawUsedInSi" TEXT,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapOrgStructureElement" (
    "id" TEXT NOT NULL,
    "elementType" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "areaLabel" TEXT,
    "sheetName" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapOrgStructureElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapGlAccount" (
    "id" TEXT NOT NULL,
    "chartOfAccounts" TEXT NOT NULL,
    "companyCode" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "longTextEn" TEXT NOT NULL,
    "glAccountType" TEXT,
    "balanceSheetAccount" TEXT,
    "groupAccountNumber" TEXT,
    "plStatementAcctType" TEXT,
    "accountGroup" TEXT,
    "tradingPartner" TEXT,
    "functionalArea" TEXT,
    "planningGroup" TEXT,
    "countryVariant" TEXT NOT NULL DEFAULT '',
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapGlAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapCoMasterObject" (
    "id" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "controllingArea" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "name" TEXT,
    "category" TEXT,
    "hierarchy" TEXT,
    "functionalArea" TEXT,
    "country" TEXT,
    "level" INTEGER,
    "sourceRow" INTEGER NOT NULL,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapCoMasterObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapTaxCode" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "taxCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionLocal" TEXT,
    "taxType" TEXT,
    "euCode" TEXT,
    "errorIndicator" TEXT,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapTaxCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapTaxRate" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "taxCode" TEXT NOT NULL,
    "validFrom" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "rate" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapTaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapTaxAccountAssignment" (
    "id" TEXT NOT NULL,
    "taxCode" TEXT NOT NULL,
    "description" TEXT,
    "transactionKey" TEXT NOT NULL,
    "glAccount" TEXT NOT NULL,
    "countryVariant" TEXT NOT NULL DEFAULT '',
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapTaxAccountAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SapFiscalYearVariant" (
    "id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "postingPeriods" TEXT NOT NULL,
    "specialPeriods" TEXT NOT NULL,
    "calendarYearDependent" TEXT,
    "corporateFyvCapable" TEXT,
    "origin" TEXT,
    "remarks" TEXT,
    "releaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SapFiscalYearVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SapFormTemplate_releaseId_idx" ON "SapFormTemplate"("releaseId");

-- CreateIndex
CREATE INDEX "SapFormTemplate_applicationArea_idx" ON "SapFormTemplate"("applicationArea");

-- CreateIndex
CREATE INDEX "SapFormTemplate_relevantFor_idx" ON "SapFormTemplate"("relevantFor");

-- CreateIndex
CREATE INDEX "SapFormTemplate_scopeItemCodes_idx" ON "SapFormTemplate" USING GIN ("scopeItemCodes");

-- CreateIndex
CREATE UNIQUE INDEX "SapFormTemplate_releaseId_name_outputType_adobeFormTemplate_key" ON "SapFormTemplate"("releaseId", "name", "outputType", "adobeFormTemplate");

-- CreateIndex
CREATE INDEX "SapOrgStructureElement_releaseId_idx" ON "SapOrgStructureElement"("releaseId");

-- CreateIndex
CREATE INDEX "SapOrgStructureElement_elementType_idx" ON "SapOrgStructureElement"("elementType");

-- CreateIndex
CREATE UNIQUE INDEX "SapOrgStructureElement_releaseId_sheetName_elementType_code_key" ON "SapOrgStructureElement"("releaseId", "sheetName", "elementType", "code");

-- CreateIndex
CREATE INDEX "SapGlAccount_releaseId_idx" ON "SapGlAccount"("releaseId");

-- CreateIndex
CREATE INDEX "SapGlAccount_accountNumber_idx" ON "SapGlAccount"("accountNumber");

-- CreateIndex
CREATE INDEX "SapGlAccount_accountGroup_idx" ON "SapGlAccount"("accountGroup");

-- CreateIndex
CREATE UNIQUE INDEX "SapGlAccount_releaseId_countryVariant_chartOfAccounts_compa_key" ON "SapGlAccount"("releaseId", "countryVariant", "chartOfAccounts", "companyCode", "accountNumber");

-- CreateIndex
CREATE INDEX "SapCoMasterObject_releaseId_objectType_code_idx" ON "SapCoMasterObject"("releaseId", "objectType", "code");

-- CreateIndex
CREATE INDEX "SapCoMasterObject_releaseId_idx" ON "SapCoMasterObject"("releaseId");

-- CreateIndex
CREATE INDEX "SapCoMasterObject_objectType_idx" ON "SapCoMasterObject"("objectType");

-- CreateIndex
CREATE UNIQUE INDEX "SapCoMasterObject_releaseId_objectType_controllingArea_code_key" ON "SapCoMasterObject"("releaseId", "objectType", "controllingArea", "code", "sourceRow");

-- CreateIndex
CREATE INDEX "SapTaxCode_releaseId_idx" ON "SapTaxCode"("releaseId");

-- CreateIndex
CREATE INDEX "SapTaxCode_country_idx" ON "SapTaxCode"("country");

-- CreateIndex
CREATE UNIQUE INDEX "SapTaxCode_releaseId_country_taxCode_key" ON "SapTaxCode"("releaseId", "country", "taxCode");

-- CreateIndex
CREATE INDEX "SapTaxRate_releaseId_idx" ON "SapTaxRate"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "SapTaxRate_releaseId_country_taxCode_validFrom_conditionTyp_key" ON "SapTaxRate"("releaseId", "country", "taxCode", "validFrom", "conditionType");

-- CreateIndex
CREATE INDEX "SapTaxAccountAssignment_releaseId_idx" ON "SapTaxAccountAssignment"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "SapTaxAccountAssignment_releaseId_countryVariant_taxCode_tr_key" ON "SapTaxAccountAssignment"("releaseId", "countryVariant", "taxCode", "transactionKey", "glAccount");

-- CreateIndex
CREATE INDEX "SapFiscalYearVariant_releaseId_idx" ON "SapFiscalYearVariant"("releaseId");

-- CreateIndex
CREATE UNIQUE INDEX "SapFiscalYearVariant_releaseId_variant_key" ON "SapFiscalYearVariant"("releaseId", "variant");

-- AddForeignKey
ALTER TABLE "SapFormTemplate" ADD CONSTRAINT "SapFormTemplate_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapOrgStructureElement" ADD CONSTRAINT "SapOrgStructureElement_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapGlAccount" ADD CONSTRAINT "SapGlAccount_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapCoMasterObject" ADD CONSTRAINT "SapCoMasterObject_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapTaxCode" ADD CONSTRAINT "SapTaxCode_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapTaxRate" ADD CONSTRAINT "SapTaxRate_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapTaxAccountAssignment" ADD CONSTRAINT "SapTaxAccountAssignment_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SapFiscalYearVariant" ADD CONSTRAINT "SapFiscalYearVariant_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "SapContentRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

