"use client";

/**
 * <OtpInput> — segmented one-time-code entry (design brief §3.7).
 *
 * Renders `length` single-digit boxes that auto-advance, support paste and
 * OS autofill (box 0 carries autoComplete="one-time-code"), backspace, and
 * arrow navigation. The concatenated value is mirrored into a hidden field
 * named `name` (default "otp") so the existing native form POST to
 * /c/verify/submit keeps working unchanged.
 *
 * §6.7 collision note: the boxes are styled inline (no global `.otp` class)
 * so they can never inherit the audit EventChip's OTP styles.
 */

import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

interface OtpInputProps {
  /** Hidden field name submitted with the form. */
  name?: string;
  /** Number of digit boxes. */
  length?: number;
  autoFocus?: boolean;
}

const boxStyle: CSSProperties = {
  width: 48,
  height: 56,
  textAlign: "center",
  fontSize: 22,
  fontFamily: "var(--font-mono), ui-monospace, monospace",
  border: "1px solid var(--border-default, #E5E1D6)",
  borderRadius: 8,
  background: "var(--surface-paper, #FFFFFE)",
  color: "var(--ink-primary, #1A1A1A)",
  boxSizing: "border-box",
};

export function OtpInput({ name = "otp", length = 6, autoFocus = true }: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length }, () => ""),
  );
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const value = digits.join("");

  function focusInput(index: number) {
    const el = inputs.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  }

  function fillFrom(index: number, raw: string) {
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < raw.length && index + i < length; i += 1) {
        next[index + i] = raw[i] ?? "";
      }
      return next;
    });
    focusInput(Math.min(index + raw.length, length - 1));
  }

  function handleChange(index: number, e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    if (raw.length === 0) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }
    if (raw.length > 1) {
      // Paste or OS autofill landed multiple digits — distribute them.
      fillFrom(index, raw);
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      next[index] = raw;
      return next;
    });
    if (index < length - 1) focusInput(index + 1);
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        setDigits((prev) => {
          const next = [...prev];
          next[index] = "";
          return next;
        });
      } else if (index > 0) {
        e.preventDefault();
        focusInput(index - 1);
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusInput(index - 1);
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      focusInput(index + 1);
    }
  }

  function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    e.preventDefault();
    fillFrom(index, text);
  }

  return (
    <div
      role="group"
      aria-label={`${length}-digit verification code`}
      style={{ display: "flex", gap: 8 }}
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          // Box 0 accepts the full code so OS/SMS autofill can paste it in
          // one shot; handleChange distributes the extra digits.
          maxLength={i === 0 ? length : 1}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1} of ${length}`}
          autoFocus={autoFocus && i === 0}
          value={digit}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          style={boxStyle}
        />
      ))}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
