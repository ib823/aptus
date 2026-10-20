/**
 * The step-up vocabulary shared by the server gate and the browser.
 *
 * A SEPARATE MODULE BECAUSE THE BROWSER NEEDS IT. `lib/auth/step-up.ts` writes
 * audit rows and so reaches Prisma; the client helper that answers a refusal
 * with a passkey prompt must not import that. These constants are the whole
 * contract between the two, so they live where both can read them.
 */

/** How fresh a passkey assertion must be for a governance action: 5 minutes. */
export const STEP_UP_MAX_AGE_SECONDS = 5 * 60;

/**
 * The refusal codes, carried as `error.code` on a 403.
 *
 *   STEP_UP_REQUIRED            the person has a passkey; ask for it, then retry
 *   STEP_UP_ENROLMENT_REQUIRED  the person has none; offer enrolment first
 *   STEP_UP_TOKEN_REFUSED       the caller is a personal or CI token, which can
 *                               never perform a governance action, so there is
 *                               nothing to prompt for
 */
export const STEP_UP_CODES = {
  required: "STEP_UP_REQUIRED",
  enrolmentRequired: "STEP_UP_ENROLMENT_REQUIRED",
  tokenRefused: "STEP_UP_TOKEN_REFUSED",
} as const;

export type StepUpCode = (typeof STEP_UP_CODES)[keyof typeof STEP_UP_CODES];

/** The two refusals a person can answer by using (or adding) a passkey. */
export function isPromptableStepUpCode(code: unknown): code is "STEP_UP_REQUIRED" | "STEP_UP_ENROLMENT_REQUIRED" {
  return code === STEP_UP_CODES.required || code === STEP_UP_CODES.enrolmentRequired;
}
