/**
 * OnboardingTour.tsx — first-login guided product tour.
 *
 * New file. Self-contained: no third-party tour library added (avoids new
 * dependencies / package.json changes). Mounted once from App.tsx's
 * Dashboard component with three props: profile, view, navigate — all of
 * which already exist there. Renders nothing until profile.has_completed_onboarding
 * is explicitly false (brand-new users only).
 *
 * v2: repositions the tooltip next to the spotlighted element (instead of a
 * static centered card), auto-scrolls targets into view, and gives the
 * highlighted element a bright accent ring so it visually pops instead of
 * being flattened by the modal's own translucent background.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { UserProfile, ViewMode } from '../../types'
import { ONBOARDING_STEPS } from './onboardingSteps'
import { markOnboardingComplete } from '../../lib/onboarding'

interface OnboardingTourProps {
  profile: UserProfile | null
  view: ViewMode
  navigate: (v: ViewMode) => void
}

const SPOTLIGHT_PADDING = 8
const CARD_WIDTH = 384 // matches modal-box max-w-sm
const CARD_MARGIN = 16 // gap between spotlight and card, and card and viewport edge

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ profile, view, navigate }) => {
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const initialized = useRef(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [cardHeight, setCardHeight] = useState(220) // measured after render for accurate placement

  const step = ONBOARDING_STEPS[stepIndex]
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1

  // Activate once, only for users who have never completed the tour.
  useEffect(() => {
    if (initialized.current) return
    if (profile && profile.has_completed_onboarding === false) {
      initialized.current = true
      setActive(true)
    }
  }, [profile])

  // Navigate the app to whichever view the current step needs.
  useEffect(() => {
    if (!active) return
    if (step.view && step.view !== view) {
      navigate(step.view)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex])

  // Track the spotlighted element's position while this step is showing.
  // Also scrolls the target into view so steps never point at off-screen elements.
  useEffect(() => {
    if (!active || !step.target) {
      setRect(null)
      return
    }
    let scrolled = false
    const update = () => {
      const el = document.querySelector(step.target as string)
      if (!el) {
        setRect(null)
        return
      }
      if (!scrolled) {
        scrolled = true
        const current = el.getBoundingClientRect()
        const fitsInView = current.top >= 0 && current.bottom <= window.innerHeight
        if (!fitsInView) {
          el.scrollIntoView({ block: 'start', behavior: 'smooth' })
        }
      }
      setRect(el.getBoundingClientRect())
    }
    update()
    const interval = window.setInterval(update, 200)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [active, stepIndex, step.target])

  // Measure the rendered card so placement math uses its real height, not a guess.
  useLayoutEffect(() => {
    if (cardRef.current) {
      setCardHeight(cardRef.current.getBoundingClientRect().height)
    }
  })

  if (!active) return null

  // Permanently marks the tour as done (natural completion or explicit opt-out).
  const complete = async () => {
    setActive(false)
    await markOnboardingComplete()
  }

  // Closes the tour for this session only — no DB write, so it reappears
  // next login. Used for the (X) button and clicking outside the card.
  const dismissForNow = () => {
    setActive(false)
  }

  const goNext = () => {
    if (isLastStep) {
      // Finishing all steps is session-only, same as (X)/backdrop — only the
      // explicit "Don't show this again" button permanently completes the tour.
      dismissForNow()
    } else {
      setStepIndex(i => i + 1)
    }
  }

  const goBack = () => {
    if (stepIndex > 0) setStepIndex(i => i - 1)
  }

  // ── Placement ──────────────────────────────────────────────────────────
  // For steps with a target, position the card next to the visible portion
  // of the spotlighted element (below by default, above if there's no room,
  // clamped so it never runs off-screen). Steps without a target (e.g. the
  // welcome screen) keep a simple centered card.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  let cardStyle: React.CSSProperties
  if (rect) {
    const visibleTop = Math.max(rect.top, 0)
    const visibleBottom = Math.min(rect.bottom, vh)
    const roomBelow = vh - visibleBottom
    const roomAbove = visibleTop
    const placeBelow = roomBelow >= cardHeight + CARD_MARGIN || roomBelow >= roomAbove

    const top = placeBelow
      ? Math.min(visibleBottom + CARD_MARGIN, vh - cardHeight - CARD_MARGIN)
      : Math.max(visibleTop - cardHeight - CARD_MARGIN, CARD_MARGIN)

    const idealLeft = rect.left + rect.width / 2 - CARD_WIDTH / 2
    const left = Math.min(Math.max(idealLeft, CARD_MARGIN), vw - CARD_WIDTH - CARD_MARGIN)

    cardStyle = { position: 'fixed', top, left, width: CARD_WIDTH, zIndex: 10001, opacity: 1, visibility: 'visible' }
  } else {
    cardStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: CARD_WIDTH,
      zIndex: 10001,
      opacity: 1,
      visibility: 'visible',
    }
  }

  const spotlightStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
        borderRadius: 12,
        // Bright accent ring around the target + dark cutout mask over the rest of the page,
        // all in one box-shadow so nothing else can draw a translucent layer on top of it.
        boxShadow: '0 0 0 3px #6366f1, 0 0 12px 2px rgba(99,102,241,0.6), 0 0 0 9999px rgba(0,0,0,0.65)',
        transition: 'all 0.2s ease',
        pointerEvents: 'none',
        zIndex: 10000,
      }
    : {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 10000,
      }

  return (
    <>
      <div style={spotlightStyle} data-testid="onboarding-spotlight" onClick={dismissForNow} />
      <div
        ref={cardRef}
        className="modal-box max-w-sm relative shadow-2xl"
        style={cardStyle}
        role="dialog"
        aria-modal="true"
      >
        <button
          className="btn btn-ghost btn-xs btn-square absolute right-3 top-3"
          onClick={dismissForNow}
          aria-label="Remind me later"
          title="Remind me later"
        >
          <X size={14} />
        </button>
        <p className="text-xs font-medium text-primary/70 mb-1">
          Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
        </p>
        <h3 className="font-bold text-lg mb-2 pr-6">{step.title}</h3>
        <p className="text-sm text-base-content/70 leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-between mt-6">
          <div className="flex gap-1">
            {ONBOARDING_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? 'w-4 bg-primary' : 'w-1.5 bg-base-300'
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={goBack}>
                Back
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={goNext}>
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
        <button
          className="btn btn-link btn-xs text-base-content/40 hover:text-base-content/70 no-underline hover:underline px-0 mt-2"
          onClick={() => void complete()}
        >
          Don't show this again
        </button>
      </div>
    </>
  )
}
