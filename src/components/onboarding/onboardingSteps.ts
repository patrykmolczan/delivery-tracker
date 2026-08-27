/**
 * onboardingSteps.ts — step data for the first-login guided tour.
 * New file — pure data, no logic touching existing components.
 */
import type { ViewMode } from '../../types'

export interface OnboardingStep {
  id: string
  /** View the app should navigate to for this step. null = stay on current view. */
  view: ViewMode | null
  /** CSS selector (matching a data-tour attribute) to spotlight. null = centered card, no spotlight. */
  target: string | null
  title: string
  body: string
  /** Optional: auto-select this value on a <select> matching selector when the step opens (demo only; skipped if the field already has a value). */
  autoSelect?: { selector: string; value: string }
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    view: null,
    target: null,
    title: 'Welcome to Delivery Tracker! 👋',
    body: "Let's take a quick tour so you know how to request a project, track it, and get updates. This will only take about a minute.",
  },
  {
    id: 'new-project-nav',
    view: 'dashboard',
    target: '[data-tour="nav-new-project"]',
    title: 'Start Here: New Project',
    body: 'Every project begins with a request. Click "New Project" in the sidebar any time you need to kick one off.',
  },
  {
    id: 'new-project-form',
    view: 'new-project',
    target: '[data-tour="new-project-form"]',
    title: 'Fill Out Your Request',
    body: 'Enter the project details as accurately as you can. New requests always start in "Under Review" status — your team will confirm details before work begins.',
  },
  {
    id: 'project-type',
    view: 'new-project',
    target: '[data-tour="project-type-field"]',
    title: 'Select Your Project Type',
    body: "You must select a Project Type here. We've picked Pay Intel (Right Sourcing) as an example — for your real request, choose whichever matches your project. The Pay Intel (Rate Card) template or the Pay Intel (Right Sourcing) template is the ONLY accepted template. No other file or format will work.",
    autoSelect: { selector: '[data-tour="project-type-field"] select', value: 'Pay Intel (Right Sourcing)' },
  },
  {
    id: 'template-download',
    view: 'new-project',
    target: '[data-tour="template-download-strip"]',
    title: 'Download the Template',
    body: 'Once a Project Type is selected, its template button appears right here. Click it to download the template, fill it out, then upload it below.',
  },
  {
    id: 'ai-quality-review',
    view: 'new-project',
    target: '[data-tour="ai-quality-review"]',
    title: 'Let AI Catch Mistakes',
    body: 'Upload a job template and our AI reviews it for issues — missing job descriptions, invalid locations, and more — so you can fix problems before you submit.',
  },
  {
    id: 'submit',
    view: 'new-project',
    target: '[data-tour="submit-project"]',
    title: 'Submit Your Request',
    body: "When everything looks good, click here. If your data quality needs a second look, we'll give you a heads-up first — nothing is ever blocked from submitting.",
  },
  {
    id: 'all-projects-nav',
    view: 'new-project',
    target: '[data-tour="nav-table"]',
    title: 'Track Your Projects',
    body: 'Head to "All Projects" any time to find your requests and see where they stand.',
  },
  {
    id: 'project-status',
    view: 'table',
    target: '[data-tour="projects-table"]',
    title: 'View Status & Updates',
    body: 'Click any project row to open its full details — status, delivery estimate, notes, and history all live there.',
  },
  {
    id: 'request-changes',
    view: 'table',
    target: '[data-tour="projects-table"]',
    title: 'Need Something Changed?',
    body: 'Inside a project, use the "Request Changes" button to send feedback — your assigned analyst is notified right away.',
  },
  {
    id: 'notifications',
    view: 'table',
    target: '[data-tour="notification-bell"]',
    title: "You're All Set 🎉",
    body: 'Watch the bell icon for status updates and notifications. Reach out to your admin any time if you have questions.',
  },
]
