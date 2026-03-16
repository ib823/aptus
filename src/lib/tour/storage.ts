/** Tour completion state — persisted in localStorage */

const STORAGE_KEY = "abeam-tours";

interface TourState {
  [tourId: string]: {
    completedAt?: string;
    dismissedAt?: string;
  };
}

function getState(): TourState {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TourState) : {};
  } catch {
    return {};
  }
}

function setState(state: TourState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked — silently ignore
  }
}

export function isTourComplete(tourId: string): boolean {
  const state = getState();
  return !!(state[tourId]?.completedAt || state[tourId]?.dismissedAt);
}

export function markTourComplete(tourId: string): void {
  const state = getState();
  state[tourId] = { ...state[tourId], completedAt: new Date().toISOString() };
  setState(state);
}

export function markTourDismissed(tourId: string): void {
  const state = getState();
  state[tourId] = { ...state[tourId], dismissedAt: new Date().toISOString() };
  setState(state);
}

export function resetTour(tourId: string): void {
  const state = getState();
  delete state[tourId];
  setState(state);
}

export function resetAllTours(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently ignore
  }
}
