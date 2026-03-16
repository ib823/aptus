/** Tour completion state — persisted in localStorage */

const STORAGE_KEY = "abeam-tours";
const PENDING_TOUR_KEY = "abeam-tour-pending";

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

/** Set a tour to start after page navigation */
export function setPendingTour(tourId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PENDING_TOUR_KEY, tourId);
  } catch {
    // Silently ignore
  }
}

/** Get and clear the pending tour (one-time read) */
export function consumePendingTour(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const tourId = localStorage.getItem(PENDING_TOUR_KEY);
    if (tourId) localStorage.removeItem(PENDING_TOUR_KEY);
    return tourId;
  } catch {
    return null;
  }
}
