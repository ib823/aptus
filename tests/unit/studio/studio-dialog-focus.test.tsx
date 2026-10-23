/**
 * The P1.2 dialogs take the keyboard as their role says (WCAG 2.4.3, the
 * dialog pattern): "Register from a description file" and the SAP API Policy
 * §1.2 sign-off declare role="dialog" and aria-modal="true", so focus moves
 * into them when they open, Tab and Shift+Tab stay inside, Escape closes
 * them, and focus goes back to the control that opened them. While a sign-off
 * is being recorded, the keyboard belongs to the passkey prompt on top.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PolicySignOffDialog } from "@/components/studio/PolicySignOffDialog";
import { UploadDescriptionDialog } from "@/components/studio/UploadDescriptionDialog";

afterEach(() => vi.unstubAllGlobals());

const SOLUTIONS = [{ id: "sol_1", name: "Sales" }];
const PRODUCTS = [{ key: "s4hana", label: "SAP S/4HANA Cloud Public Edition" }];

/** A page with the trigger that opens the dialog, as Discover and Interfaces have. */
function Harness({ which, onClose = () => undefined }: { which: "upload" | "sign-off"; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onClose();
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && which === "upload" && <UploadDescriptionDialog solutions={SOLUTIONS} products={PRODUCTS} defaultProduct="s4hana" onClose={close} />}
      {open && which === "sign-off" && (
        <PolicySignOffDialog interfaceId="if_1" serviceIdentity="custom:/sap/opu/odata/sap/yy1_x_cds" onClose={close} onSigned={() => undefined} />
      )}
    </>
  );
}

function open(which: "upload" | "sign-off", onClose?: () => void) {
  render(<Harness which={which} onClose={onClose} />);
  const trigger = screen.getByRole("button", { name: "Open" });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole("dialog") };
}

const tab = (shift = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey: shift });

describe.each(["upload", "sign-off"] as const)("the %s dialog", (which) => {
  it("moves focus into itself when it opens", () => {
    const { dialog } = open(which);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.tagName).toBe("H2");
  });

  it("keeps Tab and Shift+Tab inside, wrapping at both ends", () => {
    const { dialog } = open(which);
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, a[href]"));
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    last.focus();
    tab();
    expect(document.activeElement).toBe(first);
    tab(true);
    expect(document.activeElement).toBe(last);
    // From the heading it was given on opening, Shift+Tab goes to the last control, not behind the dialog.
    (dialog.querySelector("h2") as HTMLElement).focus();
    tab(true);
    expect(document.activeElement).toBe(last);
  });

  it("closes on Escape and gives focus back to the control that opened it", () => {
    const onClose = vi.fn();
    const { trigger } = open(which, onClose);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("the sign-off while it is recorded", () => {
  it("leaves Escape and Tab to the passkey prompt on top", async () => {
    // The request waits, as it does while the step-up dialog asks for a passkey.
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    const onClose = vi.fn();
    const { dialog } = open("sign-off", onClose);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign off" }));
    });
    expect(screen.getByRole("button", { name: "Recording…" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBe(dialog);
  });
});
