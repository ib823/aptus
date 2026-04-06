import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentTabNav } from "@/components/layout/AssessmentTabNav";
import { MobileBottomTabBar } from "@/components/layout/MobileBottomTabBar";

const mockUsePathname = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
  useRouter: () => ({ push: mockPush }),
}));

describe("assessment navigation", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
    mockPush.mockReset();
  });

  it("marks a locked setup sub-tab as disabled and blocks navigation", () => {
    mockUsePathname.mockReturnValue("/assessment/assessment-1/profile");

    render(
      <AssessmentTabNav
        assessmentId="assessment-1"
        assessmentStatus="draft"
        scopeLocked
        profileScore={55}
      />,
    );

    const scopeTab = screen.getByRole("tab", { name: /scope/i });
    expect(scopeTab).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(scopeTab);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("marks premature desktop stages as disabled during setup", () => {
    mockUsePathname.mockReturnValue("/assessment/assessment-1/profile");

    render(
      <AssessmentTabNav
        assessmentId="assessment-1"
        assessmentStatus="draft"
      />,
    );

    const reviewTab = screen.getByRole("tab", { name: /^review$/i });
    expect(reviewTab).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(reviewTab);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("navigates to unlocked desktop stages once the assessment is in progress", () => {
    mockUsePathname.mockReturnValue("/assessment/assessment-1/profile");

    render(
      <AssessmentTabNav
        assessmentId="assessment-1"
        assessmentStatus="in_progress"
      />,
    );

    const reviewTab = screen.getByRole("tab", { name: /^review$/i });
    expect(reviewTab).not.toHaveAttribute("aria-disabled");
    expect(reviewTab).toHaveAttribute("href", "/assessment/assessment-1/review");
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
