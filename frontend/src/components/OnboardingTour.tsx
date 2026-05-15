import { useEffect } from 'react';
import { driver, type DriveStep, type Driver, type PopoverDOM } from 'driver.js';
import 'driver.js/dist/driver.css';
import { onboardingStore, useOnboarding } from '../hooks/useOnboarding';

const AUTO_START_DELAY_MS = 1000;
const CHIP_SETTLE_DELAY_MS = 350;
// Minimum wait before showing the "Working its magic" popover. Avoids a
// flash of the loading dialog for fast responses: if the citation chip
// shows up inside this window, we skip the loading step entirely and go
// straight to phase 2.
const LOADING_DIALOG_MIN_DELAY_MS = 1000;
const RESPONSE_WAIT_TIMEOUT_MS = 90_000;
const STAGE_PADDING = 10;
const STAGE_RADIUS = 16;
const MOBILE_BREAKPOINT_PX = 640;

const isMobileViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX;

const positionSkipButton = (popover: PopoverDOM) => {
  if (!popover.closeButton) return;
  popover.closeButton.innerText = 'Skip';
};

// Used on the final phase-2 step: relabel the top-right corner from "Skip" to
// "Done" and drop the redundant footer next/done button. driver.js's
// `showButtons` filter doesn't reliably suppress the next button, so we strip
// it from the rendered popover DOM directly.
const labelCloseAsDone = (popover: PopoverDOM) => {
  if (popover.closeButton) {
    popover.closeButton.innerText = 'Done';
  }
  popover.nextButton?.remove();
};

const PHASE_1_STEP: DriveStep = {
  element: '[data-tour="sample-questions"]',
  popover: {
    title: 'Welcome to Abe!',
    description:
      "Let's take a quick tour. Click any sample question to see how Abe answers and cites its sources.",
    side: 'bottom',
    align: 'center',
    showButtons: ['close'],
  },
};

// Bridge step shown while the assistant is still generating its answer.
// Anchors to the loading indicator so the popover sits to its left, and
// the no-spotlight class strips the dim overlay so the user can watch
// the response stream in.
const LOADING_STEP: DriveStep = {
  element: '[data-tour="loading-message"]',
  popover: {
    title: 'Working its magic…',
    description:
      "Abe is searching our corpus and stitching together the answer with sources. This usually takes a few seconds.",
    side: 'left',
    align: 'center',
    showButtons: ['close'],
    popoverClass: 'no-spotlight',
  },
};

const buildPhase2Steps = (): DriveStep[] => {
  const hasPublicChip = !!document.querySelector('[data-tour="citation-public"]');
  const hasCicpChip = !!document.querySelector('[data-tour="citation-cicp"]');

  const steps: (DriveStep | false)[] = [
    {
      element: '[data-tour="response-body"]',
      popover: {
        title: "Here's your answer",
        description:
          'Sources are cited inline as small chips. Hover any chip to see the source title and link.',
        side: 'top',
        align: 'start',
        popoverClass: 'no-spotlight',
      },
    },
    hasPublicChip && {
      element: '[data-tour="citation-public"]',
      popover: {
        title: 'Public source',
        description:
          'Grey "Public" chips cite publicly accessible sources. Hover the chip to preview, then click the title to open the source in a new tab.',
        side: 'bottom',
        align: 'start',
        popoverClass: 'no-spotlight interactive-chip',
      },
    },
    hasCicpChip && {
      element: '[data-tour="citation-cicp"]',
      popover: {
        title: 'CICP-only source',
        description:
          'Blue "CICP" chips cite sources that require a Cloud Infrastructure Community Program membership. Hover the chip to preview, or <a href="https://internet2.edu/services/cloud-infrastructure-community-program/" target="_blank" rel="noopener noreferrer">learn more about CICP</a>.',
        side: 'bottom',
        align: 'start',
        popoverClass: 'no-spotlight interactive-chip',
      },
    },
    {
      element: '[data-tour="sources-pill"]',
      onHighlightStarted: (el) => {
        // Scroll the sources-pill (which sits at the bottom of the answer)
        // to the bottom of the viewport so the user sees the tail end of the
        // response in context.
        el?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      },
      popover: {
        title: 'All sources',
        description:
          'Click here to open a side panel listing every source cited in this response.',
        side: 'top',
        align: 'start',
        popoverClass: 'no-spotlight',
      },
    },
    {
      element: '[data-tour="about-link"]',
      popover: {
        title: 'About',
        description:
          'Learn more about Abe, CICP, and how this assistant works on the About page.',
        side: 'bottom',
        align: 'end',
        popoverClass: 'no-spotlight',
      },
    },
    {
      element: '[data-tour="tour-toggle"]',
      popover: {
        title: 'Tour',
        description:
          'Replay this walkthrough anytime, or end it early from here.',
        side: 'bottom',
        align: 'end',
        popoverClass: 'no-spotlight',
      },
    },
    {
      element: '[data-tour="theme-toggle"]',
      popover: {
        title: 'Light & dark mode',
        description: 'Switch themes anytime.',
        side: 'bottom',
        align: 'end',
        onPopoverRender: labelCloseAsDone,
        popoverClass: 'no-spotlight',
      },
    },
  ];

  return steps.filter((step): step is DriveStep => step !== false);
};

export default function OnboardingTour() {
  const { shouldAutoStart, isActive, start } = useOnboarding();

  // Auto-start on first visit. Skip on narrow viewports — the popovers and
  // spotlight crowd the screen on phones, so the tour is desktop-only.
  useEffect(() => {
    if (!shouldAutoStart || isMobileViewport()) return;
    const timer = window.setTimeout(start, AUTO_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [shouldAutoStart, start]);

  // Drive the tour while it's active.
  useEffect(() => {
    if (!isActive || isMobileViewport()) return;

    let activeDriver: Driver | null = null;
    let chipObserver: MutationObserver | null = null;
    let loadingObserver: MutationObserver | null = null;
    let responseWaitTimeout: number | null = null;
    let loadingDelayTimer: number | null = null;
    let positionRafId: number | null = null;
    let trackedElement: Element | null = null;
    let trackedPopoverEl: HTMLElement | null = null;
    let offsetLeft = 0;
    let offsetTop = 0;
    // Set while we tear down the driver ourselves so phase-1's onDestroyed
    // can tell our destroy from driver.js's own (backdrop click with
    // allowClose:true).
    let isInternalDestroy = false;

    const destroyDriver = () => {
      if (activeDriver) {
        isInternalDestroy = true;
        try {
          activeDriver.destroy();
        } catch {
          // already destroyed
        }
        isInternalDestroy = false;
        activeDriver = null;
      }
    };

    const stopWaitingForResponse = () => {
      if (chipObserver) {
        chipObserver.disconnect();
        chipObserver = null;
      }
      if (responseWaitTimeout !== null) {
        window.clearTimeout(responseWaitTimeout);
        responseWaitTimeout = null;
      }
    };

    const stopWaitingForLoadingMessage = () => {
      if (loadingObserver) {
        loadingObserver.disconnect();
        loadingObserver = null;
      }
    };

    const cancelLoadingDelay = () => {
      if (loadingDelayTimer !== null) {
        window.clearTimeout(loadingDelayTimer);
        loadingDelayTimer = null;
      }
    };

    // Follow the active element 1:1 each frame so the popover tracks scroll
    // (the chat area scrolls its own container, not the window, so driver.js's
    // window-scroll listener never fires for the scroll the user actually
    // performs) and in-page layout shifts (e.g. the sources side panel sliding
    // open). Going through `activeDriver.refresh()` would queue another rAF
    // inside driver.js, leaving the popover a frame behind; instead we drive
    // the popover's top/left ourselves so it moves in lockstep with the
    // element. We re-query `.driver-popover` every frame because driver.js
    // recreates the wrapper between steps, and any cached reference would
    // point at the detached old popover halfway through the step transition.
    const trackActiveElementPosition = () => {
      positionRafId = window.requestAnimationFrame(trackActiveElementPosition);
      if (!activeDriver) return;
      const el = activeDriver.getActiveElement();
      if (!el) return;
      const popoverEl = document.querySelector<HTMLElement>('.driver-popover');
      if (!popoverEl) return;

      // Re-baseline whenever either side of the (element, popover) pair
      // changes — step transition replaces the popover element, and active
      // element changes likewise need a fresh offset.
      if (el !== trackedElement || popoverEl !== trackedPopoverEl) {
        const elRect = el.getBoundingClientRect();
        const popRect = popoverEl.getBoundingClientRect();
        // Wait one frame if driver.js hasn't positioned the popover yet — the
        // default CSS lands it at (0,0) in the top-left corner, and baselining
        // against that produces a bad offset.
        if (popRect.width === 0 || popRect.height === 0) return;
        offsetLeft = popRect.left - elRect.left;
        offsetTop = popRect.top - elRect.top;
        trackedElement = el;
        trackedPopoverEl = popoverEl;
        return;
      }

      const elRect = el.getBoundingClientRect();
      popoverEl.style.left = `${elRect.left + offsetLeft}px`;
      popoverEl.style.top = `${elRect.top + offsetTop}px`;
      popoverEl.style.right = 'auto';
      popoverEl.style.bottom = 'auto';
    };
    positionRafId = window.requestAnimationFrame(trackActiveElementPosition);

    const startPhase2 = () => {
      stopWaitingForResponse();
      stopWaitingForLoadingMessage();
      destroyDriver(); // tear down the loading-phase driver, if any
      const steps = buildPhase2Steps();
      if (steps.length === 0) {
        onboardingStore.complete();
        return;
      }
      // Resume at the step the user was on last time, if it still exists
      // in the current step list. Missing or stale selectors fall back to 0.
      const savedSelector = onboardingStore.getState().lastStepSelector;
      const savedIndex = savedSelector
        ? steps.findIndex((step) => step.element === savedSelector)
        : -1;
      const startIndex = savedIndex >= 0 ? savedIndex : 0;
      const d = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: '»',
        prevBtnText: '«',
        doneBtnText: 'Done',
        steps,
        onPopoverRender: positionSkipButton,
        onHighlighted: (_el, step) => {
          // Persist the resume pointer as the user advances so a future
          // skip → restart can rehydrate at the same step.
          if (typeof step.element === 'string') {
            onboardingStore.saveStep(step.element);
          }
        },
        stagePadding: STAGE_PADDING,
        stageRadius: STAGE_RADIUS,
        onCloseClick: () => {
          // On the last step the close button is relabeled to "Done" — treat
          // that click as completion rather than skip.
          if (activeDriver && !activeDriver.hasNextStep()) {
            onboardingStore.complete();
          } else {
            onboardingStore.skip();
          }
          destroyDriver();
        },
        onDestroyed: () => {
          // If we got here without a skip, the user reached the end.
          if (onboardingStore.getState().status === 'in-progress') {
            onboardingStore.complete();
          }
        },
      });
      activeDriver = d;
      d.drive(startIndex);
    };

    const beginWaitingForResponse = () => {
      const checkForChip = () => {
        const chip = document.querySelector(
          '[data-tour="citation-public"], [data-tour="citation-cicp"]',
        );
        if (chip) {
          // Cancel the pending loading-dialog mount as soon as we see chips,
          // not later when startPhase2 runs — otherwise the dialog can flash
          // during the chip-settle window.
          cancelLoadingDelay();
          stopWaitingForResponse();
          window.setTimeout(startPhase2, CHIP_SETTLE_DELAY_MS);
        }
      };
      chipObserver = new MutationObserver(checkForChip);
      chipObserver.observe(document.body, { childList: true, subtree: true });
      checkForChip();
      responseWaitTimeout = window.setTimeout(() => {
        stopWaitingForResponse();
        startPhase2();
      }, RESPONSE_WAIT_TIMEOUT_MS);
    };

    const beginPhase1 = () => {
      const d = driver({
        showProgress: false,
        allowClose: true,
        steps: [PHASE_1_STEP],
        onPopoverRender: positionSkipButton,
        stagePadding: STAGE_PADDING,
        stageRadius: STAGE_RADIUS,
        onCloseClick: () => {
          onboardingStore.skip();
          destroyDriver();
        },
        onDestroyed: () => {
          // Phase 1 uses the default (spotlit) overlay, so clicking outside
          // the popover lands on driver.js's backdrop and — with
          // allowClose:true — destroys the driver without routing through
          // onCloseClick. If we don't sync the store here, the welcome
          // dialog vanishes but `isActive` stays true, leaving a stale blue
          // dot on the tour toggle until the user clicks it twice.
          if (!isInternalDestroy && onboardingStore.getState().status === 'in-progress') {
            onboardingStore.skip();
          }
        },
      });
      activeDriver = d;
      d.drive();
    };

    const beginLoadingPhase = () => {
      const mount = () => {
        const d = driver({
          showProgress: false,
          allowClose: true,
          steps: [LOADING_STEP],
          onPopoverRender: positionSkipButton,
          onCloseClick: () => {
            onboardingStore.skip();
            destroyDriver();
          },
        });
        activeDriver = d;
        d.drive();
      };
      // The loading-message element only appears once `isLoading` flips true
      // in ChatArea, which lags the click by the WelcomeScreen lift animation
      // (~180ms) plus the time for sendQuery to mark loading. Wait for the
      // anchor to exist so driver.js can position relative to it instead of
      // falling back to a centered dummy element.
      if (document.querySelector('[data-tour="loading-message"]')) {
        mount();
        return;
      }
      loadingObserver = new MutationObserver(() => {
        if (document.querySelector('[data-tour="loading-message"]')) {
          stopWaitingForLoadingMessage();
          mount();
        }
      });
      loadingObserver.observe(document.body, { childList: true, subtree: true });
    };

    const unsubscribeClick = onboardingStore.onQuestionClicked(() => {
      if (!activeDriver) return;
      destroyDriver();
      // Defer the loading dialog by LOADING_DIALOG_MIN_DELAY_MS so fast
      // responses don't trigger a brief "Working its magic" flash —
      // checkForChip clears this timer the moment a citation chip appears,
      // taking us straight to phase 2 instead.
      loadingDelayTimer = window.setTimeout(() => {
        loadingDelayTimer = null;
        beginLoadingPhase();
      }, LOADING_DIALOG_MIN_DELAY_MS);
      beginWaitingForResponse();
    });

    // Pick the entry phase based on the current app state, so toggling the
    // tour mid-session resumes at the right place instead of restarting from
    // the welcome dialog. Probe DOM markers in order from most-advanced to
    // least: a rendered response → phase 2; a loading bubble → loading phase;
    // a welcome screen → phase 1. The 200ms delay gives layout a beat to
    // settle before driver.js measures anchor positions.
    const detectAndStart = () => {
      if (document.querySelector('[data-tour="response-body"]')) {
        startPhase2();
      } else if (document.querySelector('[data-tour="loading-message"]')) {
        beginLoadingPhase();
        beginWaitingForResponse();
      } else if (document.querySelector('[data-tour="sample-questions"]')) {
        beginPhase1();
      }
    };
    const startTimer = window.setTimeout(detectAndStart, 200);

    return () => {
      window.clearTimeout(startTimer);
      unsubscribeClick();
      stopWaitingForResponse();
      stopWaitingForLoadingMessage();
      cancelLoadingDelay();
      if (positionRafId !== null) {
        window.cancelAnimationFrame(positionRafId);
        positionRafId = null;
      }
      destroyDriver();
    };
  }, [isActive]);

  return null;
}
