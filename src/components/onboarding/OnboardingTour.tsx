/**
 * OnboardingTour.tsx — first-login guided product tour.
 *
 * New file. Self-contained: no third-party tour library added (avoids new
 * dependencies / package.json changes). Mounted once from App.tsx's
 * Dashboard component with three props: profile, view, navigate — all of
 * which already exist there. Renders nothing until profile.has_completed_onboarding
 * is explicitly false (brand-new users only).
 */
import React, { useEffect, useRef, useState } from 'react'
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

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ profile, view, navigate }) => {
  const [active, setActive] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const initialized = useRef(false)

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
  useEffect(() => {
    if (!active || !step.target) {
      setRect(null)
      return
    }
    const update = () => {
      const el = document.querySelector(step.target as string)
      setRect(el ? el.getBoundingClientRect() : null)
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

  if (!active) return null

  const finish = async () => {
    setActive(false)
    await markOnboardingComplete()
  }

  const goNext = () => {
    if (isLastStep) {
      void finish()
    } else {
      setStepIndex(i => i + 1)
    }
  }

  const goBack = () => {
    if (stepIndex > 0) setStepIndex(i => i - 1)
  }

  const spotlightStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
        borderRadius: 12,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
        transition: 'all 0.2s ease',
        pointerEvents: 'none',
        zIndex: 10000,
      }
    : {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 10000,
      }

  return (
    <>
      <div style={spotlightStyle} data-testid="onboarding-spotlight" />
      <div
        className="modal modal-open"
        style={{ zIndex: 10001 }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-box max-w-sm relative">
          <button
            className="btn btn-ghost btn-xs btn-square absolute right-3 top-3"
            onClick={() => void finish()}
            aria-label="Skip tour"
            title="Skip tour"
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
        </div>
        <div className="modal-backdrop" onClick={() => void finish()} />
      </div>
    </>
  )
}
