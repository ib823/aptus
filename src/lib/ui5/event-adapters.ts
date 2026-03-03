/**
 * Event adapter utilities for bridging UI5 Web Component events
 * to React-standard event interfaces.
 *
 * UI5 components fire custom events with different signatures than
 * native HTML/React events. These adapters normalize the interface
 * so react-hook-form and existing onChange handlers work unchanged.
 */

import type { Ui5CustomEvent } from "@ui5/webcomponents-react";

/**
 * Adapt a UI5 Input `onInput` event to a React-style onChange handler.
 * UI5 Input fires `onInput` with the value on `e.target.value`.
 */
export function adaptInputChange(
  handler?: (e: React.ChangeEvent<HTMLInputElement>) => void,
) {
  if (!handler) return undefined;
  return (e: Ui5CustomEvent) => {
    const target = e.target as HTMLInputElement;
    const syntheticEvent = {
      ...e,
      target,
      currentTarget: target,
      type: "change",
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    handler(syntheticEvent);
  };
}

/**
 * Adapt a UI5 TextArea `onInput` event to a React-style onChange handler.
 */
export function adaptTextAreaChange(
  handler?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void,
) {
  if (!handler) return undefined;
  return (e: Ui5CustomEvent) => {
    const target = e.target as unknown as HTMLTextAreaElement;
    const syntheticEvent = {
      ...e,
      target,
      currentTarget: target,
      type: "change",
    } as unknown as React.ChangeEvent<HTMLTextAreaElement>;
    handler(syntheticEvent);
  };
}

/**
 * Adapt a UI5 Select `onChange` event to a value-change handler.
 * UI5 Select fires onChange with `e.detail.selectedOption`.
 */
export function adaptSelectChange(
  handler?: (value: string) => void,
) {
  if (!handler) return undefined;
  return (e: Ui5CustomEvent) => {
    const selectedOption = (e.detail as Record<string, unknown>).selectedOption as HTMLElement | undefined;
    const value = selectedOption?.getAttribute("data-value") ?? selectedOption?.getAttribute("value") ?? "";
    handler(value);
  };
}

/**
 * Adapt a UI5 CheckBox `onChange` event to a boolean handler.
 */
export function adaptCheckboxChange(
  handler?: (checked: boolean) => void,
) {
  if (!handler) return undefined;
  return (e: Ui5CustomEvent) => {
    const target = e.target as HTMLInputElement;
    handler(target.checked);
  };
}

/**
 * Adapt a UI5 Switch `onChange` event to a boolean handler.
 */
export function adaptSwitchChange(
  handler?: (checked: boolean) => void,
) {
  if (!handler) return undefined;
  return (e: Ui5CustomEvent) => {
    const target = e.target as HTMLInputElement;
    handler(target.checked);
  };
}
