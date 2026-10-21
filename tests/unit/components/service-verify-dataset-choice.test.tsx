/**
 * The verify's dataset picker when the service declares more datasets than
 * the answer lists (P1.3, structural hardening round 4). The answer carries
 * the first MAX_LISTED_DATASETS names and how many there are in all; the
 * picker said "offers 600 datasets, pick one" and offered 500. It now says
 * the list is cut and takes any other name typed in.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DatasetChoice, datasetListNote } from "@/components/studio/ServiceVerifyPanel";

vi.setConfig({ testTimeout: 30_000 });

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const listed = Array.from({ length: 500 }, (_, i) => `Set${i}`);

describe("the dataset picker past the listed names", () => {
  it("says how many are shown of how many, and only when the list is cut", () => {
    expect(datasetListNote(500, 600)).toBe("Showing the first 500 of 600 datasets. For another, type its name.");
    expect(datasetListNote(3, 3)).toBeNull();
    // An answer from before entitySetCount existed lists everything it has.
    expect(datasetListNote(3, undefined)).toBeNull();
  });

  it("offers a dataset past the first 500 by name", () => {
    const onChoose = vi.fn();
    render(<DatasetChoice sets={listed} count={600} current={null} pick="Set0" onPick={vi.fn()} onChoose={onChoose} busy={false} idPrefix="t" />);
    expect(screen.getByText("Showing the first 500 of 600 datasets. For another, type its name.")).toBeTruthy();
    // Not among the listed options…
    expect(screen.queryByRole("option", { name: "Set599" })).toBeNull();
    // …and still reachable.
    fireEvent.change(screen.getByLabelText("Dataset name"), { target: { value: " Set599 " } });
    fireEvent.click(screen.getByRole("button", { name: "Use this name" }));
    expect(onChoose).toHaveBeenCalledWith("Set599");
  });

  it("shows no name field when every dataset is listed", () => {
    render(<DatasetChoice sets={["A", "B"]} count={2} current="A" pick="A" onPick={vi.fn()} onChoose={vi.fn()} busy={false} idPrefix="u" />);
    expect(screen.queryByLabelText("Dataset name")).toBeNull();
    expect(screen.getByRole("option", { name: "A (current)" })).toBeTruthy();
  });
});
