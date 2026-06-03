/**
 * <ConsultantContactCard> — the "Your ABeam contact" block shown on the
 * terminal pages (design brief §5.2).
 *
 * Renders the owning consultant's real details (resolved from the bundle in
 * the page) — never fixture data. Avatar shows initials in navy on a
 * navy-soft circle; name in semibold; email + optional phone as anchors; a
 * CTA that opens a pre-addressed mail draft.
 */

interface ConsultantContactCardProps {
  name: string;
  email: string;
  phone?: string | null;
  /** Subject line for the "Email {firstName}" CTA. */
  subject?: string;
  /** Eyebrow label above the card. */
  label?: string;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

export function ConsultantContactCard({
  name,
  email,
  phone,
  subject = "Re: presales workbench access",
  label = "Your ABeam contact",
}: ConsultantContactCardProps) {
  return (
    <section
      style={{
        marginTop: 32,
        paddingTop: 24,
        borderTop: "1px solid var(--border-default, #E5E1D6)",
        textAlign: "left",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-muted, #8A8A8A)",
          marginBottom: 12,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          aria-hidden
          style={{
            width: 48,
            height: 48,
            borderRadius: 9999,
            background: "var(--brand-navy-soft, #E6EBF1)",
            color: "var(--brand-navy, #002B5C)",
            fontFamily: "var(--font-serif), Georgia, serif",
            fontSize: 18,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {initials(name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--ink-primary, #1A1A1A)",
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: 14,
              color: "var(--ink-secondary, #4A4A4A)",
              marginTop: 2,
            }}
          >
            <a href={`mailto:${email}`} style={{ color: "inherit", textDecoration: "none" }}>
              {email}
            </a>
            {phone ? (
              <>
                {" · "}
                <a
                  href={`tel:${phone.replace(/\s/g, "")}`}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  {phone}
                </a>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 20 }}>
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 40,
            padding: "0 18px",
            background: "var(--cta-red, #C8102E)",
            color: "#FFFFFF",
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 8,
            textDecoration: "none",
          }}
        >
          Email {firstName(name)}
        </a>
      </div>
    </section>
  );
}
