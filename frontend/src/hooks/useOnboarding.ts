import { useSyncExternalStore } from 'react';

export const ONBOARDING_STORAGE_KEY = 'i2ccc:onboarding:v1';

export type OnboardingStatus = 'pending' | 'in-progress' | 'completed' | 'skipped';

interface OnboardingState {
  status: OnboardingStatus;
  // Selector of the step the tour was on the last time it was highlighted.
  // Persisted across skip → restart so users resume where they left off
  // instead of restarting phase 2 from the top.
  lastStepSelector?: string;
}

const readFromStorage = (): OnboardingState => {
  if (typeof window === 'undefined') return { status: 'pending' };
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return { status: 'pending' };
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    const status = parsed.status;
    const lastStepSelector =
      typeof parsed.lastStepSelector === 'string' ? parsed.lastStepSelector : undefined;
    if (status === 'pending' || status === 'in-progress' || status === 'completed' || status === 'skipped') {
      // Treat a lingering in-progress state from a prior session as pending so it auto-restarts.
      return {
        status: status === 'in-progress' ? 'pending' : status,
        lastStepSelector,
      };
    }
  } catch {
    // Fall through to default.
  }
  return { status: 'pending' };
};

const writeToStorage = (state: OnboardingState): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota / disabled storage — in-memory state still works for this session.
  }
};

let currentState: OnboardingState = readFromStorage();
const stateListeners = new Set<() => void>();
const questionClickListeners = new Set<() => void>();

const setState = (next: OnboardingState) => {
  currentState = next;
  writeToStorage(next);
  stateListeners.forEach((cb) => cb());
};

const subscribeState = (cb: () => void): (() => void) => {
  stateListeners.add(cb);
  return () => {
    stateListeners.delete(cb);
  };
};

const getSnapshot = () => currentState;

export const onboardingStore = {
  getState: () => currentState,
  // Fresh runs (auto-start, full replay) drop any stale resume pointer.
  start: () => setState({ status: 'in-progress' }),
  // Toggling the tour off keeps the resume pointer so the next restart can
  // pick up where the user left off.
  skip: () => setState({ ...currentState, status: 'skipped' }),
  complete: () => setState({ status: 'completed' }),
  restart: () => setState({ ...currentState, status: 'in-progress' }),
  saveStep: (selector: string) => {
    if (currentState.lastStepSelector === selector) return;
    setState({ ...currentState, lastStepSelector: selector });
  },
  notifyQuestionClicked: () => {
    questionClickListeners.forEach((cb) => cb());
  },
  onQuestionClicked: (cb: () => void): (() => void) => {
    questionClickListeners.add(cb);
    return () => {
      questionClickListeners.delete(cb);
    };
  },
};

export const useOnboarding = () => {
  const state = useSyncExternalStore(subscribeState, getSnapshot, getSnapshot);
  return {
    status: state.status,
    isActive: state.status === 'in-progress',
    shouldAutoStart: state.status === 'pending',
    start: onboardingStore.start,
    skip: onboardingStore.skip,
    complete: onboardingStore.complete,
    restart: onboardingStore.restart,
    notifyQuestionClicked: onboardingStore.notifyQuestionClicked,
  };
};
