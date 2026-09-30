/** Map source catalog identifiers to the product names used throughout Aptus. */
const productLabelKeys: Record<string, string> = {
  "S/4HANA Cloud Public Edition": "s4hana",
  SUCCESSFACTORS: "successfactors",
  ARIBA: "ariba",
};

export function scopeProductLabelKey(product: string): string {
  return productLabelKeys[product] ?? product;
}
