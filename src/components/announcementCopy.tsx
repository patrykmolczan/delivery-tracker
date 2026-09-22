/**
 * announcementCopy.tsx — JSX bodies for announcements, keyed by Announcement.id.
 *
 * Kept separate from src/lib/announcements.ts so that module can stay plain
 * TypeScript (no JSX) and remain trivially unit-testable.
 */
import React from 'react'

export const ANNOUNCEMENT_BODY: Record<string, React.ReactNode> = {
  'client-project-type-refresh-2026-09': (
    <>
      Client Type now offers <strong className="text-primary">RightSourcing</strong>,{' '}
      <strong className="text-primary">Commercial</strong>, and{' '}
      <strong className="text-primary">Pay Intel</strong> (Pay Intel restricted to Admins).
      Project Type now offers <strong className="text-primary">RFP</strong>,{' '}
      <strong className="text-primary">MRA</strong>,{' '}
      <strong className="text-primary">Benchmark Baseline (MRM)</strong>,{' '}
      <strong className="text-primary">Benchmark Baseline (MRM Refresh)</strong>, and{' '}
      <strong className="text-primary">Rate Card</strong>, replacing the previous
      RFP (Sales Request) / Pay Intel (Rate Card) / Pay Intel (Right Sourcing) list.
    </>
  ),
}
