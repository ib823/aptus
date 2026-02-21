/** Phase 18: Workshop session code generator */

/**
 * Characters allowed in session codes.
 * Excludes ambiguous characters: O, I, L, 0, 1
 */
const SESSION_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SESSION_CODE_LENGTH = 6;

/**
 * Generate a 6-character uppercase alphanumeric session code.
 * Excludes O, I, L, 0, 1 for readability.
 * Pure function suitable for testing.
 */
export function generateSessionCode(): string {
  let code = "";
  for (let i = 0; i < SESSION_CODE_LENGTH; i++) {
    const index = Math.floor(Math.random() * SESSION_CODE_CHARS.length);
    code += SESSION_CODE_CHARS[index];
  }
  return code;
}
