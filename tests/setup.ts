import "@testing-library/jest-dom/vitest";

/*
 * THE GOVERNANCE STEP-UP IS OFF FOR TESTS THAT ARE NOT ABOUT IT.
 *
 * Its production default is warn (lib/auth/step-up.ts), which writes an audit
 * row on every governance action taken without a fresh passkey. The route
 * suites for grants, keys and connections assert on exactly which audit rows
 * a call writes, and their users carry no passkey state — under warn each of
 * them would gain a STEP_UP_MISSING row that has nothing to do with what they
 * test. The step-up suites set each mode explicitly (vi.stubEnv) and test the
 * default by reading the parser with no value, so nothing about the real
 * default is hidden by this line.
 */
process.env.COREEDGE_STEP_UP ??= "off";

/*
 * THE ENVELOPE'S ALLOWANCE OVER TIME IS A DEPLOYMENT'S, NOT A SUITE'S
 * (lib/contracts/envelope-allowance.ts). A suite compiles hundreds of
 * descriptions — many built to run to their limits — under a handful of
 * organisation ids, in one process, within the hour: past any production
 * allowance. Generous here, so the envelope's other limits are what each
 * suite meets; the allowance's own suite sets its store, clock and sizes.
 */
process.env.COREEDGE_ENVELOPE_TENANT_SECONDS_PER_HOUR ??= "10000000";
process.env.COREEDGE_ENVELOPE_TENANT_SECONDS_PER_DAY ??= "10000000";
process.env.COREEDGE_ENVELOPE_DEPLOYMENT_SECONDS_PER_DAY ??= "10000000";
process.env.COREEDGE_ENVELOPE_READ_SECONDS_PER_HOUR ??= "10000000";
process.env.COREEDGE_ENVELOPE_READ_SECONDS_PER_DAY ??= "10000000";
