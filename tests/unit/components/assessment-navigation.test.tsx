import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StepSubTabs } from "@/components/aptus/StepSubTabs";
import { MobileBottomTabBar } from "@/components/layout/MobileBottomTabBar";

const mockUsePathname = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush }),
}));

describe("StepSubTabs", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
    mockPush.mockReset();
  });

  it("renders nothing when there is at most one tab", () => {
    const { container } = render(
      <StepSubTabs
        items={[{ label: "Profile", href: "/assessment/a1/profile" }]}
        activeHref="/assessment/a1/profile"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the matching tab as the current page", () => {
    render(
      <StepSubTabs
        items={[
          { label: "Scope", href: "/assessment/a1/scope" },
          { label: "Requirements", href: "/assessment/a1/requirements" },
        ]}
        activeHref="/assessment/a1/requirements"
      />,
    );
    expect(screen.getByRole("link", { name: "Requirements" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Scope" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("treats the active tab's sub-routes as current", () => {
    render(
      <StepSubTabs
        items={[{ label: "Review", href: "/assessment/a1/review" }]}
        activeHref="/assessment/a1/review/scope-item-42"
      />,
    );
    // Single-item lists render nothing — assert via a 2-item list
    render(
      <StepSubTabs
        items={[
          { label: "Process Map", href: "/assessment/a1/process-map" },
          { label: "Review", href: "/assessment/a1/review" },
        ]}
        activeHref="/assessment/a1/review/scope-item-42"
      />,
    );
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("renders disabled tabs as non-link plain text with the disabled reason", () => {
    render(
      <StepSubTabs
        items={[
          { label: "Scope", href: "/assessment/a1/scope", disabled: true, disabledReason: "Complete the Profile to unlock Scope." },
          { label: "Requirements", href: "/assessment/a1/requirements", disabled: true, disabledReason: "Complete the Profile to unlock Scope." },
        ]}
        activeHref="/assessment/a1/profile"
      />,
    );
    expect(screen.queryByRole("link", { name: "Scope" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Requirements" })).toBeNull();
    const disabled = screen.getByText("Scope");
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    expect(disabled).toHaveAttribute("title", "Complete the Profile to unlock Scope.");
  });
});

describe("MobileBottomTabBar", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
    mockPush.mockReset();
  });

  it("marks premature mobile stages as disabled during setup", () => {
    mockUsePathname.mockReturnValue("/assessment/assessment-1/profile");

    render(
      <MobileBottomTabBar
        assessmentId="assessment-1"
        assessmentStatus="draft"
      />,
    );

    // Locked tabs no longer have href, so they're not "link" role — find by text
    const reviewText = screen.getByText("Review");
    const reviewTab = reviewText.closest("a")!;
    expect(reviewTab).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(reviewTab);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates to unlocked mobile stages once the assessment is in progress", () => {
    mockUsePathname.mockReturnValue("/assessment/assessment-1/profile");

    render(
      <MobileBottomTabBar
        assessmentId="assessment-1"
        assessmentStatus="in_progress"
      />,
    );

    const reviewLink = screen.getByRole("link", { name: /review/i });
    expect(reviewLink).not.toHaveAttribute("aria-disabled");
    expect(reviewLink).toHaveAttribute("href", "/assessment/assessment-1/review");
  });
});
