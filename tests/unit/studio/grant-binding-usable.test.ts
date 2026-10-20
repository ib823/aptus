/**
 * Which fetched grants may authorise a call on an interface (P0.1, wave 1a
 * integration review). The real-PostgreSQL broker test drives this end to
 * end; this pins the rule itself, edge by edge.
 */

import { describe, expect, it } from "vitest";

import { grantsUsableUnder, isUsableUnder, type GrantedInterface } from "@/lib/studio/grant-binding";

const DEPLOY = new Date("2026-10-22T00:00:00Z");
const before = (ms: number) => new Date(DEPLOY.getTime() - ms);
const after = (ms: number) => new Date(DEPLOY.getTime() + ms);

const iface = (createdAt: Date): GrantedInterface => ({
  id: "if_1",
  externalId: "API_BUSINESS_PARTNER",
  operation: "READ",
  sapProduct: "s4hana-onprem",
  createdAt,
});

const unbound = { interfaceId: null, sapProduct: null, createdAt: before(86_400_000), unboundCutoffAt: DEPLOY };

describe("isUsableUnder", () => {
  it("a bound grant authorises its own interface in either mode, whenever that interface was added", () => {
    const bound = { interfaceId: "if_1", sapProduct: "s4hana-onprem", createdAt: after(1), unboundCutoffAt: null };
    expect(isUsableUnder(bound, iface(after(60_000)), "legacy")).toBe(true);
    expect(isUsableUnder(bound, iface(after(60_000)), "strict")).toBe(true);
  });

  it("a grant bound elsewhere never authorises, even under legacy", () => {
    const elsewhere = { interfaceId: "if_2", sapProduct: "s4hana", createdAt: before(1), unboundCutoffAt: null };
    expect(isUsableUnder(elsewhere, iface(before(60_000)), "legacy")).toBe(false);
    // Its own interface id, but another product: not its approval either.
    const otherProduct = { ...elsewhere, interfaceId: "if_1" };
    expect(isUsableUnder(otherProduct, iface(before(60_000)), "legacy")).toBe(false);
  });

  it("legacy honours an unbound grant on an interface that existed at the deploy, and on none added since", () => {
    expect(isUsableUnder(unbound, iface(before(60_000)), "legacy")).toBe(true);
    expect(isUsableUnder(unbound, iface(DEPLOY), "legacy")).toBe(true);
    expect(isUsableUnder(unbound, iface(after(1)), "legacy")).toBe(false);
  });

  it("strict honours no unbound grant", () => {
    expect(isUsableUnder(unbound, iface(before(60_000)), "strict")).toBe(false);
  });

  it("an unstamped grant (the old code wrote it during the rollout) uses its own creation as the cut-off", () => {
    const rollout = { interfaceId: null, sapProduct: null, createdAt: after(5_000), unboundCutoffAt: null };
    expect(isUsableUnder(rollout, iface(after(1_000)), "legacy")).toBe(true);
    expect(isUsableUnder(rollout, iface(after(10_000)), "legacy")).toBe(false);
  });

  it("grantsUsableUnder keeps exactly the usable ones", () => {
    const bound = { interfaceId: "if_1", sapProduct: "s4hana-onprem", createdAt: after(1), unboundCutoffAt: null };
    expect(grantsUsableUnder([unbound, bound], iface(after(60_000)), "legacy")).toEqual([bound]);
  });
});
