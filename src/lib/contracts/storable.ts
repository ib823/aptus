/**
 * TEXT NO DATABASE COLUMN CAN HOLD. CSDL JSON can spell U+0000 and an
 * unpaired surrogate ("\u0000", "\ud800"); XML cannot, and saxes refuses
 * both as character references (a raw unpaired high surrogate in the string
 * it is handed still gets through it). PostgreSQL refuses either in text,
 * text[] and jsonb: a description naming a dataset "x\u0000y" beside the
 * interface's own verified, then the verify's write of its dataset list threw
 * and the route answered 500 on every verify, and a property so named
 * compiled into a contract no snapshot could ever store (hostile-input review
 * round 3).
 *
 * The compiler refuses a description that holds either (compile.ts); the
 * verify filters the dataset names the older readers list (service-verify.ts).
 */

const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** Does `s` hold U+0000 or an unpaired surrogate? One linear pass, no backtracking. */
export function unstorableText(s: string): boolean {
  return s.includes("\u0000") || LONE_SURROGATE.test(s);
}
