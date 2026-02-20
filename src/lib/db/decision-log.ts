/** Decision log queries — append-only, read operations */

// Re-export from the audit module which is the single source for decision log operations
export { logDecision, getDecisionLog } from "@/lib/audit/decision-logger";
