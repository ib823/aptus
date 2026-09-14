/**
 * ConfirmDialog's modality, which was asserted and not enforced.
 *
 * It has carried `aria-modal="true"` since PR-2 while Tab walked straight out
 * into the page behind it and the only way to dismiss was the Cancel button. A
 * dialog that announces itself as modal and is not is worse than one that never
 * claimed to be: a screen-reader user is told the rest of the page is inert
 * while their focus is standing in it.
 *
 * These are its first real users' requirement — revoking a key goes through it.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/coreedge/ConfirmDialog";
import { CONFIRMATIONS } from "@/lib/coreedge/copy";

function open(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const result = render(
    <ConfirmDialog
      open
      copy={CONFIRMATIONS.revokeKey}
      tone="terminal"
      impact={["Calls with this key fail from now on."]}
      onConfirm={onConfirm}
      onCancel={onCancel}
      id="revoke"
      {...overrides}
    />,
  );
  return { ...result, onCancel, onConfirm };
}

describe("Escape closes it", () => {
  it("cancels on Escape", () => {
    const { onCancel } = open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels rather than confirms, even mid-submit", () => {
    /*
     * The escape hatch on a destructive confirmation must never be the thing
     * that fires it. Revocation cannot be undone.
     */
    const { onCancel, onConfirm } = open({ submitting: true });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("does nothing on Escape when it is closed", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open={false}
        copy={CONFIRMATIONS.revokeKey}
        tone="terminal"
        impact={["x"]}
        onConfirm={vi.fn()}
        onCancel={onCancel}
        id="revoke"
      />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("focus goes in, stays in, and comes back", () => {
  it("moves focus to the heading on open", () => {
    open();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2 }));
  });

  it("restores focus to the control that opened it", () => {
    // Without this, dismissing returns focus to <body> and a keyboard user
    // restarts at the top of the page — having pressed Escape precisely
    // because they did not want to move.
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = open();
    expect(document.activeElement).not.toBe(opener);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("wraps Tab at the end and Shift+Tab at the start", () => {
    const { container } = open();
    const panel = container.querySelector('[role="dialog"]') as HTMLElement;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("keeps the claim it makes", () => {
    // The attribute is what tells assistive technology the page behind is
    // inert. The trap above is what makes that true.
    const { container } = open();
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
  });
});
