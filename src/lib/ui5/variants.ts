/**
 * Variant mapping utilities — shadcn variant names to UI5 design props.
 */

/**
 * Variant mapping utilities — shadcn variant names to UI5 design prop strings.
 * UI5 v2 uses string literals for design/valueState props.
 */

/** Map shadcn button variants to UI5 ButtonDesign string values. */
export function mapButtonVariant(variant?: string): string {
  switch (variant) {
    case "default":
      return "Emphasized";
    case "destructive":
      return "Negative";
    case "outline":
      return "Default";
    case "secondary":
      return "Default";
    case "ghost":
      return "Transparent";
    case "link":
      return "Transparent";
    default:
      return "Emphasized";
  }
}

/** Map shadcn alert variants to UI5 MessageStrip design names. */
export function mapAlertVariant(variant?: string): string {
  switch (variant) {
    case "destructive":
      return "Negative";
    default:
      return "Information";
  }
}

/** Map form field error/success states to UI5 ValueState strings. */
export function mapValueState(state?: "error" | "success" | "warning" | "default"): string {
  switch (state) {
    case "error":
      return "Negative";
    case "success":
      return "Positive";
    case "warning":
      return "Critical";
    default:
      return "None";
  }
}
