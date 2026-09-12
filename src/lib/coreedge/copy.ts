/**
 * Every word the CoreEdge console says to a person.
 *
 * Transcribed from `docs/coreedge/design/A6-CoreEdge-Copy-Deck.md`, which is
 * committed, so any string here can be checked against its source.
 *
 * WHY ONE MODULE. The audit found 57 distinct user-facing message strings
 * written inline across components, several saying the same thing in different
 * words and a few contradicting each other. Copy that lives next to the markup
 * gets edited by whoever is touching the markup; copy that lives here gets
 * edited by whoever is deciding what the product claims.
 *
 * A6's stated tone, kept because it is the reason these strings read the way
 * they do: "Direct and calm, written from the user's side of the screen. Say
 * what happened, why, and the one thing to do next. Don't apologise, don't be
 * vague, and don't pack in jargon."
 *
 * INTERPOLATION. A6 writes placeholders as {env}, {date}, {dataset}, {system},
 * {n}. They are kept as typed functions rather than template strings with loose
 * arguments, so a missing value is a type error rather than the word
 * "undefined" on a screen someone is trying to act on.
 */

import type { LaneHop, LaneStatus, StatusOwner } from "./status-vocabulary";

/* ─────────────────────────────────────────────────────────────────────────────
 * Primary actions
 * ────────────────────────────────────────────────────────────────────────── */

export interface ActionCopy {
  /** The button. */
  readonly button: string;
  /** The toast after it succeeds, or null where A6 shows the result inline. */
  readonly success: string | null;
  /** True where A6 marks the control red and requires a confirmation step. */
  readonly destructive?: true;
}

/**
 * A6's "Primary actions" table. The toasts with names and key tails in them are
 * examples in the deck; the functions below produce the real ones.
 */
export const ACTIONS = {
  createApp: { button: "Create app", success: "App created" },
  addDataFeed: { button: "Add data feed", success: null },
  promote: { button: "Promote to Test", success: null },
  approve: { button: "Approve", success: null },
  approveSandboxOnly: { button: "Approve for Sandbox only", success: null },
  approveReadOnly: { button: "Approve read-only", success: null },
  requestChanges: { button: "Request changes", success: null },
  reject: { button: "Reject…", success: null },
  collectKey: { button: "Collect key", success: null },
  replaceKey: { button: "Replace key…", success: "Key replaced · the old key stopped working", destructive: true },
  revokeKey: { button: "Revoke key…", success: "Key revoked", destructive: true },
  run: { button: "Run", success: null },
  downloadSdk: { button: "Download SDK", success: "SDK downloaded" },
  recheck: { button: "Re-check now", success: "Checked just now" },
  sendToSapAdmin: { button: "Send to SAP admin", success: "Note sent to the client's SAP admin" },
  renewAccess: { button: "Renew access", success: null },
} as const satisfies Record<string, ActionCopy>;

export type ActionKey = keyof typeof ACTIONS;

/**
 * Toasts that name something. A6 gives each as an example with a real value in
 * it — "Purchase orders added · Sandbox lane is live" — so the shape is the
 * copy and the value is the caller's.
 */
export const ACTION_TOASTS = {
  dataFeedAdded: (feed: string, env: string): string => `${feed} added · ${env} lane is live`,
  promoted: (reviewer: string, others: number): string =>
    others > 0
      ? `Review requested · ${reviewer} and ${others} ${others === 1 ? "other" : "others"} notified`
      : `Review requested · ${reviewer} notified`,
  approved: (recipient: string): string => `Approved · key issued to ${recipient}`,
  keyCollected: (tail: string): string => `Key collected · ends …${tail}`,
  accessRenewed: (until: string): string => `Access renewed until ${until}`,
  promoteTo: (env: string): string => `Promote to ${env}`,
} as const;

/* ─────────────────────────────────────────────────────────────────────────────
 * Lane states — the chip and the line under it
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A6's "Lane states" table gives the chip and the line beneath it. The chip text
 * itself comes from the status vocabulary — this is only the supporting line, so
 * the two cannot disagree about what a lane is called.
 *
 * Nine of the eighteen statuses appear in A6's table. The rest carry no line in
 * the deck; `null` means "render the chip alone", which is different from
 * rendering an empty string and different again from a line nobody wrote.
 */
export type LaneDetailLine = (facts: LaneDetailFacts) => string | null;

export interface LaneDetailFacts {
  readonly rows?: number;
  readonly checkedAgo?: string;
  readonly reviewer?: string;
  readonly waitingFor?: string;
  readonly lastProvenAgo?: string;
  readonly retryIn?: string;
  readonly endedOn?: string;
}

export const LANE_DETAIL: Readonly<Record<LaneStatus, LaneDetailLine>> = {
  live: (f) =>
    f.rows === undefined || f.checkedAgo === undefined
      ? null
      : `${f.rows} ${f.rows === 1 ? "row" : "rows"} · checked ${f.checkedAgo}`,
  noData: (f) =>
    f.checkedAgo === undefined ? "0 rows · not an error" : `0 rows · checked ${f.checkedAgo} · not an error`,
  inReview: (f) =>
    f.reviewer === undefined
      ? "Waiting on a reviewer"
      : `Waiting on ${f.reviewer}${f.waitingFor === undefined ? "" : ` · ${f.waitingFor}`}`,
  sapRefused: (f) =>
    f.checkedAgo === undefined
      ? "Metadata OK · data read 403"
      : `Metadata OK · data read 403 · ${f.checkedAgo}`,
  noAccess: () => "Request access to use this lane",
  noKey: () => "Collect or renew the key",
  keyNotValid: () => "Collect or renew the key",
  noSapSystem: () => "Platform admin has been asked",
  unknown: (f) =>
    f.lastProvenAgo === undefined ? "Re-check" : `Last proven ${f.lastProvenAgo} · re-check`,
  notStarted: () => null,

  /*
   * The nine below are not in A6's lane-state table. Their lines are derived
   * from the handoff's section 5 "Means" column for the same status, rather than
   * invented — see status-vocabulary.ts, where those strings are verbatim. Where
   * the handoff gives nothing actionable, the line is null and the chip stands
   * alone.
   */
  accessEnded: (f) => (f.endedOn === undefined ? "Renewing keeps the same key" : `Ended ${f.endedOn} · renewing keeps the same key`),
  rateLimited: (f) => (f.retryIn === undefined ? "Nothing was sent to SAP" : `Nothing was sent to SAP · try again in ${f.retryIn}`),
  bindingRefused: () => "Two systems claim this environment",
  systemOff: () => "Deactivated on purpose",
  secretUnreadable: () => "CoreEdge cannot read its own stored secret",
  signInRefused: () => "Every lane on this system has stopped",
  sapUnavailable: () => "Nothing refused · we stopped calling",
  circuitOpen: (f) => (f.retryIn === undefined ? "Recovering" : `Recovering · retry in ${f.retryIn}`),
};

/* ─────────────────────────────────────────────────────────────────────────────
 * Why? trace — one explanation per broken hop
 * ────────────────────────────────────────────────────────────────────────── */

export interface WhyExplanation {
  readonly headline: string;
  readonly body: string;
  readonly owner: StatusOwner;
  /** The one action. Null where A6's Action column is "—". */
  readonly action: string | null;
}

/**
 * A6's "Why? trace" table, keyed by the case rather than by the hop, because two
 * of its rows share a hop and differ in owner and action — Access vs Access
 * (expired), and Binding vs Binding (ambiguous). Collapsing them onto the hop
 * would lose exactly the distinction the table was drawn to make.
 */
export type WhyCase =
  | "key"
  | "access"
  | "accessExpired"
  | "binding"
  | "bindingAmbiguous"
  | "sapMetadata401"
  | "sapDataRead403"
  | "sap404"
  | "sapTimeoutOr5xx"
  | "rateLimit";

export interface WhyFacts {
  readonly env?: string;
  readonly date?: string;
  readonly dataset?: string;
  readonly system?: string;
  readonly seconds?: number;
}

/** Which hop each Why case belongs to, for positioning the trace marker. */
export const WHY_CASE_HOP: Readonly<Record<WhyCase, LaneHop>> = {
  key: "key",
  access: "access",
  accessExpired: "access",
  binding: "binding",
  bindingAmbiguous: "binding",
  sapMetadata401: "sapMetadata",
  sapDataRead403: "sapDataRead",
  sap404: "sapDataRead",
  sapTimeoutOr5xx: "sapDataRead",
  rateLimit: "key",
};

export function whyExplanation(whyCase: WhyCase, facts: WhyFacts = {}): WhyExplanation {
  const env = facts.env ?? "this environment";
  const dataset = facts.dataset ?? "this dataset";
  const system = facts.system ?? "this system";

  switch (whyCase) {
    case "key":
      return {
        headline: "This key isn't valid.",
        body: "It's missing, expired, revoked, or belongs to a retired app.",
        owner: "appOwner",
        action: "Collect / renew key",
      };
    case "access":
      return {
        headline: `No access approved for ${env}.`,
        body: "Access is approved per data feed and per environment.",
        owner: "reviewer",
        action: "Request access",
      };
    case "accessExpired":
      return {
        // A6 interpolates {date}; without one the sentence still has to parse.
        headline: facts.date === undefined ? "Access has ended." : `Access ended on ${facts.date}.`,
        body: "Renewing keeps the same key and fields.",
        owner: "appOwner",
        action: "Renew access",
      };
    case "binding":
      return {
        headline: `No SAP system is set up for ${env}.`,
        body: `This lane can't reach SAP until a ${env} system is connected.`,
        owner: "platformAdmin",
        action: "Ask platform admin",
      };
    case "bindingAmbiguous":
      return {
        headline: `Two SAP systems claim ${env}.`,
        body: "CoreEdge won't guess which one to use.",
        owner: "platformAdmin",
        action: "Open SAP systems",
      };
    case "sapMetadata401":
      return {
        headline: "SAP rejected CoreEdge's sign-in.",
        body: "The communication user's password or certificate is wrong or has expired.",
        owner: "platformAdmin",
        action: "Update SAP credentials",
      };
    case "sapDataRead403":
      return {
        headline: "SAP refused the read, so the fix is in SAP, not in CoreEdge.",
        body: `The communication user can open the service but isn't authorised to read ${dataset}.`,
        owner: "clientSapAdmin",
        action: "Send to SAP admin",
      };
    case "sap404":
      return {
        headline: `${dataset} doesn't exist on ${system}.`,
        body: "The service or dataset isn't active on this SAP system.",
        owner: "appOwner",
        action: "Choose another dataset",
      };
    case "sapTimeoutOr5xx":
      return {
        headline: "SAP didn't answer in time.",
        body: "Nothing is wrong with your app. CoreEdge will retry the check.",
        owner: "operator",
        action: "Re-check now",
      };
    case "rateLimit":
      return {
        headline: "This key hit its limit.",
        body:
          facts.seconds === undefined
            ? "60 calls per minute per key."
            : `60 calls per minute per key. Try again in ${facts.seconds} s.`,
        owner: "appOwner",
        action: null,
      };
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Empty states
 * ────────────────────────────────────────────────────────────────────────── */

export interface EmptyStateCopy {
  readonly message: string;
  /** The one button A6 puts on the empty state, if any. */
  readonly action: string | null;
}

export const EMPTY_STATES = {
  homeFirstVisit: {
    message:
      "Nothing needs you yet. Create an app, or ask your platform admin to connect the client's SAP system.",
    action: "Create app",
  },
  requestsNoneWaiting: { message: "No reviews waiting on you.", action: null },
  sapSystemsNone: {
    message: "No SAP systems yet. Connect one per environment: Sandbox, Dev, Test, Prod.",
    action: "Connect SAP system",
  },
  tryItNoRecords: {
    message: "No records. SAP answered successfully and had nothing to return.",
    action: null,
  },
  catalogueNone: {
    message:
      "No data feeds yet. A feed appears here once an app declares it, with what has been proven about it in each environment.",
    action: null,
  },
  catalogueNoMatch: {
    message: "No lane, app or call matches that.",
    action: null,
  },
  keysNone: {
    message: "No keys have been issued yet. A key is created when its owner opens a claim link.",
    action: null,
  },
  keysAllInUse: {
    message: "Every key has been used in the last 30 days. Nothing to question.",
    action: null,
  },
  passportNone: {
    message:
      "No approved access. Nothing is being read from this SAP system by any ABeam app.",
    action: null,
  },
  servicesNoneProbed: {
    message:
      "No service has been probed on this system yet, so there is nothing to report per service.",
    action: null,
  },
  appNoFeeds: { message: "This app has no data feeds.", action: null },
} as const satisfies Record<string, EmptyStateCopy>;

/**
 * A6 writes the healthy-operations empty state with real numbers in it — "All 11
 * lanes are live and checked within the last 15 minutes." A counted sentence
 * cannot be a constant without the count becoming a lie, so it is a function.
 */
export function operationsAllHealthy(laneCount: number, withinMinutes: number): string {
  return `All ${laneCount} ${laneCount === 1 ? "lane is" : "lanes are"} live and checked within the last ${withinMinutes} minutes.`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Disabled reasons
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A6's "Rules and disabled reasons".
 *
 * These are not tooltips. The component contract is that a disabled control
 * keeps its reason as a SIBLING STRING, never a `title` attribute, and stays in
 * the tab order — so a reason that only a mouse can discover is a broken
 * control, not a styled one. `DecisionBar` and `ConfirmDialog` enforce it and
 * `tests/unit/coreedge/components.test.ts` checks it.
 */
export const DISABLED_REASONS = {
  ownRequest: "You asked for this, so a colleague has to approve it.",
  ownApp: "You own this app, so a colleague has to approve its access.",
  missingExpiry: "Set an end date. Access can't be approved without one.",
  noProdSystem:
    "There's no Prod SAP system yet, so a Prod key would connect to nothing. Platform admin has been asked.",
  noPermission: "Only consultants can change this. Ask in #coreedge-support.",
  platformAdminOnly: "Only a platform admin can do this.",
  revokeNotOperator:
    "Revoking is for a platform admin or a reviewer. An operator flags and notifies.",
  addressMustMatch: "Type the app’s address to confirm.",
  noFieldSelectionStore:
    "CoreEdge can't record which fields a feed is approved for yet, so this can't be saved.",
  noWritePathYet: "This action isn't wired up yet, so nothing would happen.",
  noContractYet:
    "This lane has never returned a successful read, so there is no captured contract to build from.",
  alreadyDeactivated: "Already deactivated.",
  alreadyRevoked: "Already revoked.",
} as const;

export type DisabledReasonKey = keyof typeof DISABLED_REASONS;

/* ─────────────────────────────────────────────────────────────────────────────
 * Confirmations
 * ────────────────────────────────────────────────────────────────────────── */

export interface ConfirmCopy {
  readonly title: string;
  readonly body: string;
  readonly confirm: string;
  readonly cancel: string;
  /** A6 marks the reason field required on revoke only. */
  readonly reasonRequired: boolean;
}

export const CONFIRMATIONS = {
  replaceKey: {
    title: "Replace key?",
    body: "The current key stops working immediately. Anything still using it will fail. The new key goes only to the app owner.",
    confirm: "Replace key",
    cancel: "Cancel",
    reasonRequired: false,
  },
  revokeKey: {
    title: "Revoke key?",
    body: "This can't be undone. Calls with this key will fail from now on.",
    confirm: "Revoke key",
    cancel: "Cancel",
    reasonRequired: true,
  },
  deactivateSystem: {
    title: "Deactivate this SAP system?",
    // Navy, not red: A03 is explicit that nothing is destroyed. The lanes read
    // "System off", never "SAP refused", because a person decided this.
    body: "Lanes reading this system stop returning data until you activate it again. Nothing is destroyed: no access is withdrawn and no key is revoked.",
    confirm: "Deactivate system",
    cancel: "Cancel",
    reasonRequired: true,
  },
  rotateSecret: {
    title: "Rotate secret",
    body: "CoreEdge probes with the new secret while the old one still serves traffic, swaps only if the probe passes, and keeps the old one for five minutes so calls in flight can finish.",
    confirm: "Save and probe",
    cancel: "Cancel",
    reasonRequired: false,
  },
  retireApp: {
    title: "Retire this app?",
    body: "Retiring is permanent. Every key this app holds stops, in every environment, and Try it refuses too — there is no read-only afterlife. The timeline and audit record are kept.",
    confirm: "Retire app",
    cancel: "Cancel",
    reasonRequired: true,
  },
  addFeed: {
    title: "Add data feed",
    body: "A Sandbox lane opens immediately. Dev, Test and Prod need a review each.",
    confirm: "Add data feed",
    cancel: "Cancel",
    reasonRequired: false,
  },
} as const satisfies Record<string, ConfirmCopy>;

/* ─────────────────────────────────────────────────────────────────────────────
 * PR-6 screen prose
 *
 * Lines the seven remaining screens show. They live here for the same reason
 * every other string does: one place to read the product's voice, and one place
 * to change it. Each is transcribed from the scenario it belongs to rather than
 * written fresh.
 * ────────────────────────────────────────────────────────────────────────── */

export const SCREEN_NOTES = {
  /** O05 — why every lane in a contested environment refuses. */
  environmentContested:
    "Two connected systems both claim this environment. CoreEdge won't guess which one it means, so every lane there refuses to bind — loudly, and before any data moves. The fix is to leave one system claiming it.",
  /** A02 — why the matrix has two columns and never one dot. */
  twoFactsNeverMerged:
    "Metadata reachable says the service exists and we can describe it. Data readable says the communication user is authorised for the entity behind it. SAP grants them separately, so CoreEdge reports them separately.",
  /** O08 — a suggestion, not a sweep. */
  keysSuggestionNotSweep:
    "An unused key is a risk with no benefit, but unused is not proof of unwanted. CoreEdge suggests, the owner is told, and nothing expires on its own.",
  /** X06 — the passport has no actions, deliberately. */
  passportReadOnly:
    "Read-only. There is no revoke button here: a CIO who wants something stopped says so, and an ABeam reviewer does it with a reason on the record — governance, not a kill switch.",
  /** X06 — what the fields column would say if the backend could say it. */
  passportFieldsUnknown:
    "CoreEdge does not yet record which fields each approval covers, so this column would be a guess. It is left blank rather than filled with the number of fields SAP happens to describe.",
  /** A06 — why the address, not the name. */
  retireTypeAddress:
    "The address, not the name — two apps can share a name, and that is exactly how the wrong one gets retired.",
  /** S03 — a field change re-opens the review. */
  fieldsChangeReopensReview:
    "Pick the fields your app needs. You can change them later — a change re-opens the review.",
} as const;

/**
 * A6's third confirmation names the lanes it will stop — "4 lanes use this
 * system and will stop reading: Purchase orders · Test, …". The list IS the
 * warning, so it is built from the real lanes rather than stated as a constant:
 * a dialog that says "4 lanes" while showing three is worse than one that says
 * nothing.
 */
export function deactivateSapSystemConfirm(affectedLanes: readonly string[]): ConfirmCopy {
  const n = affectedLanes.length;
  return {
    title: "Deactivate SAP system?",
    body:
      n === 0
        ? "No lanes use this system right now."
        : `${n} ${n === 1 ? "lane uses" : "lanes use"} this system and will stop reading: ${affectedLanes.join(", ")}`,
    confirm: "Deactivate",
    cancel: "Cancel",
    reasonRequired: false,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Strings that are NOT here, on purpose
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Copy that describes a capability the backend does not have.
 *
 * The build brief is explicit: "until they exist, that copy must not ship."
 * Phrases are NAMED here rather than written, so a screen cannot reach for one
 * by accident and so the list of what is blocked is visible in code rather than
 * only in a document. `tests/unit/coreedge/copy.test.ts` fails if any appears
 * anywhere under src/.
 *
 * THE CLAIM-LINK PHRASES CAME OFF THIS LIST IN PR-5, because the capability
 * landed. "Key ready · link expired" and "Send a new link" were blocked while
 * the key was minted up front and merely revealed — which would have made
 * "shown once" a UI convention described as a guarantee, and the lane state
 * after expiry a lie. `src/lib/northbound/claim-link.ts` now mints the key
 * inside the claim, so both sentences are true and may ship.
 *
 * STILL BLOCKED: the CLI. "or run `coreedge pull`" is offered as an equal path
 * in Home, the claim screen and the key rows. It is a separate distributable
 * that does not exist in this repository, and shipping the link alone makes
 * every "or" in that copy false.
 */
export const COPY_BLOCKED_ON_BACKEND = ["coreedge pull"] as const;
