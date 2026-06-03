/**
 * <EventChip> — category-colored chip for an audit event type
 * (design brief §3.5).
 *
 * The presales audit vocabulary is `category_action` snake_case
 * (bundle_created, grant_reissued, otp_verified, session_started,
 * signoff_completed, pdf_emailed, change_request_submitted,
 * external_action_denied, ...). We colour by the leading category so the
 * audit table scans quickly.
 *
 * §6.7 collision note: the OTP category is styled inline here, never with a
 * bare `.otp` class, so it can never collide with the <OtpInput> boxes.
 */

interface EventChipProps {
  eventType: string;
}

interface ChipStyle {
  bg: string;
  fg: string;
}

const CATEGORY_STYLES: Record<string, ChipStyle> = {
  bundle: { bg: "var(--status-sent-bg, #E0EBF4)", fg: "var(--status-sent-fg, #1A4D6F)" },
  grant: { bg: "var(--status-signed-bg, #DCEBE3)", fg: "var(--status-signed-fg, #166534)" },
  otp: { bg: "var(--status-awaiting-bg, #FBE9D1)", fg: "var(--status-awaiting-fg, #8B5A00)" },
  session: { bg: "var(--status-draft-bg, #F4F2EB)", fg: "var(--status-draft-fg, #4A4A4A)" },
  signoff: { bg: "rgba(15, 118, 110, 0.12)", fg: "var(--decision-standard, #0F766E)" },
  pdf: { bg: "rgba(29, 78, 216, 0.10)", fg: "var(--decision-configure, #1D4ED8)" },
  change: { bg: "rgba(180, 83, 9, 0.10)", fg: "var(--decision-custom, #B45309)" },
  external: { bg: "var(--status-revoked-bg, #F4DEDB)", fg: "var(--status-revoked-fg, #8E2A26)" },
};

const FALLBACK: ChipStyle = {
  bg: "var(--status-draft-bg, #F4F2EB)",
  fg: "var(--status-draft-fg, #4A4A4A)",
};

function categoryOf(eventType: string): string {
  return eventType.split("_")[0]?.toLowerCase() ?? "";
}

export function EventChip({ eventType }: EventChipProps) {
  const style = CATEGORY_STYLES[categoryOf(eventType)] ?? FALLBACK;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: style.bg,
        color: style.fg,
      }}
    >
      {eventType}
    </span>
  );
}
