/**
 * Unified product list for the SAP Cloud explorer switcher — combines the
 * OData products (S/4HANA, SuccessFactors) with the REST product (Ariba),
 * each carrying its protocol and a live "configured" flag.
 */

import { getConfiguredSapTenants, SAP_ODATA_PRODUCTS } from "./tdd-connector";
import { ARIBA_PRODUCT, isAribaConfigured } from "./ariba-connector";

export interface ProductSummary {
  key: string;
  label: string;
  description: string;
  protocol: "odata" | "rest";
  configured: boolean;
}

function odataConfigured(envPrefix: string): boolean {
  try {
    return getConfiguredSapTenants(envPrefix).length > 0;
  } catch {
    return false;
  }
}

export function listProductSummaries(): ProductSummary[] {
  const odata: ProductSummary[] = SAP_ODATA_PRODUCTS.map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description,
    protocol: "odata",
    configured: odataConfigured(p.envPrefix),
  }));

  const ariba: ProductSummary = {
    key: ARIBA_PRODUCT.key,
    label: ARIBA_PRODUCT.label,
    description: ARIBA_PRODUCT.description,
    protocol: "rest",
    configured: isAribaConfigured(),
  };

  return [...odata, ariba];
}
