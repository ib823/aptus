import { useEffect, useRef } from "react";

/** What Tab may land on inside a dialog. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * What a dialog that declares role="dialog" and aria-modal="true" owes a
 * keyboard and a screen reader (WCAG 2.4.3, the dialog pattern), for the
 * Studio dialogs drawn with inline styles rather than components/ui/dialog:
 * focus moves to its heading when it opens, Tab and Shift+Tab stay inside it,
 * Escape closes it, and focus goes back to the control that opened it when it
 * closes. aria-modal tells assistive technology the page behind is inert, so
 * a dialog that left focus there would be telling it something false (P1.2
 * review round 1; the same rules as coreedge/ConfirmDialog).
 *
 * Call it from a dialog that is mounted only while it is open: mounting is
 * opening, unmounting is closing. Put `panelRef` on the panel that holds the
 * controls and `headingRef` on its heading, which takes tabIndex={-1}.
 *
 * `paused` hands the keyboard to whatever opened on top, such as the passkey
 * step-up dialog while a sign-off is recorded: neither Escape nor Tab is
 * handled meanwhile. The latest `onClose` is held in a ref, so an inline arrow
 * does not churn the listener.
 */
export function useModalDialog({ onClose, paused = false }: { onClose: () => void; paused?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    headingRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (panel === null) return;
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      // Wrap at both ends, and bring focus that is outside, or on the heading, back to the controls.
      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === headingRef.current)) {
        event.preventDefault();
        last.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [paused]);

  return { panelRef, headingRef };
}
