import React, { useState, useCallback } from 'react'
import {
  Zap, Copy, Layers, AlertTriangle, MapPin, SplitSquareVertical,
  ChevronDown, ChevronUp, CheckCircle2, AlertCircle,
  ChevronsUpDown, ChevronsDownUp, Download
} from 'lucide-react'
import type { TemplateQualityResult } from '../lib/templateQualityAnalyzer'

interface Props {
  result: TemplateQualityResult | null
  isLoading: boolean
  locationValidationWarnings?: string[]
  passingScore?: number
}


// ─── Export helper ────────────────────────────────────────────────────────────
function exportIssuesCSV(result: TemplateQualityResult, locationValidationWarnings: string[] = []) {
  const rows: string[][] = [['Category', 'Severity', 'Job Title / Detail', 'Issue', 'Suggestion']]

  result.duplicates.forEach(d => {
    rows.push(['Duplicate', d.severity, d.titles.join(' / '), d.reason, d.suggestion])
  })
  result.levelingIssues.forEach(l => {
    rows.push(['Leveling', l.severity, l.jobTitle, l.issue, l.suggestion])
  })
  result.missingDataRows.forEach(m => {
    rows.push(['Missing Data', m.severity, m.jobTitle, `Missing: ${m.missing.join(', ')}`, 'Add the missing fields to this row. Country and State/Province are required; City is optional.'])
  })
  result.locationIssues.forEach(l => {
    rows.push(['Location', l.severity, l.jobTitle, l.issue, 'Ensure Country and State/Province are both filled in for this row.'])
  })
  locationValidationWarnings.forEach(w => {
    rows.push(['Location (Invalid Value)', 'critical', '', w, 'Replace with a valid state/province or country name. Country and State/Province are required; City is optional. \'Remote\' is not a valid location.'])
  })
  ;(result.multiLocationRows || []).forEach(m => {
    rows.push([
      'Multi-Location Row',
      'critical',
      m.jobTitle,
      `${m.field} field contains multiple locations: "${m.value}"`,
      `Split into ${m.detectedLocations.length} rows: ${m.detectedLocations.join(' / ')}`
    ])
  })

  const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'template_quality_issues.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Expandable list: shows `initialShow` items, then "Show N more" inline */
function ExpandableList<T>({
  items,
  initialShow = 4,
  renderItem,
}: {
  items: T[]
  initialShow?: number
  renderItem: (item: T, i: number) => React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, initialShow)
  const hidden = items.length - initialShow

  return (
    <div className="space-y-2">
      {visible.map((item, i) => renderItem(item, i))}
      {items.length > initialShow && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full text-xs text-primary hover:text-primary/80 font-medium py-1.5 px-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5 mt-1"
        >
          {expanded
            ? <><ChevronUp className="w-3 h-3" /> Show less</>
            : <><ChevronDown className="w-3 h-3" /> Show {hidden} more</>}
        </button>
      )}
    </div>
  )
}

/** Fixed-height scrollable container with gradient fade at bottom */
function ScrollableContainer({ children, maxRows = 7 }: { children: React.ReactNode; maxRows?: number }) {
  // ~36px per row for table rows
  const maxHeight = maxRows * 36 + 40 // +40 for thead
  return (
    <div className="relative">
      <div className="overflow-y-auto rounded-lg" style={{ maxHeight }}>
        {children}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export function TemplateQualityReview({ result, isLoading, locationValidationWarnings = [], passingScore = 70 }: Props) {
  // Auto-open sections that have issues; empty sections start closed
  const getInitialOpen = useCallback(() => {
    if (!result) return new Set<string>(locationValidationWarnings.length > 0 ? ['location'] : [])
    const open = new Set<string>()
    if (result.duplicates.length > 0) open.add('duplicates')
    if (result.levelingIssues.length > 0) open.add('leveling')
    if (result.missingDataRows.length > 0) open.add('missing')
    if (result.locationIssues.length > 0) open.add('location')
    if (locationValidationWarnings.length > 0) open.add('location')
  if ((result.multiLocationRows || []).length > 0) open.add('multiloc')
    return open
  }, [result])

  const [openSections, setOpenSections] = useState<Set<string>>(getInitialOpen)

  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const collapseAll = () => setOpenSections(new Set())
  const expandAll  = () => setOpenSections(new Set(['duplicates', 'leveling', 'missing', 'location']))

  if (!isLoading && !result && locationValidationWarnings.length === 0) return null

  // ── Loading skeleton ──
  if (isLoading) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden mt-4 animate-pulse">
        <div className="p-4 flex items-center gap-3 border-b border-base-300 bg-base-200/60">
          <Zap className="w-5 h-5 text-primary animate-spin" />
          <span className="font-semibold text-base-content">Analyzing template quality with AI…</span>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-4 bg-base-300 rounded" style={{ width: `${70 + i * 10}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!result) return null

  // ── Analysis failed ──
  if (result.overallScore === -1) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden mt-4">
        <div className="p-4 flex items-center gap-3 bg-base-200/60 border-b border-base-300">
          <AlertCircle className="w-5 h-5 text-warning" />
          <span className="font-semibold text-base-content">Quality Analysis Unavailable</span>
        </div>
        <div className="p-4 text-sm text-base-content/70">{result.summary}</div>
      </div>
    )
  }

  // Score colors
  const scoreColor = result.overallScore >= passingScore ? 'text-success' : result.overallScore >= passingScore - 20 ? 'text-warning' : 'text-error'
  const scoreBg    = result.overallScore >= passingScore ? 'bg-success/10 border-success/30' : result.overallScore >= passingScore - 20 ? 'bg-warning/10 border-warning/30' : 'bg-error/10 border-error/30'
  const scoreLabel = result.overallScore >= passingScore + 20 ? 'Excellent' : result.overallScore >= passingScore ? 'Passing \u2713' : result.overallScore >= passingScore - 20 ? 'Needs Review' : result.overallScore >= passingScore - 40 ? 'Poor Quality' : 'Rework Required'

  const totalIssues = result.issueCount.critical + result.issueCount.warning + result.issueCount.info

  // ── Section header ──
  const SectionHeader = ({
    sectionKey, icon: Icon, label, count, countColorClass
  }: { sectionKey: string; icon: React.ElementType; label: string; count: number; countColorClass?: string }) => (
    <button
      type="button"
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-base-200/60 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-base-content/60" />
        <span className="font-medium text-sm text-base-content">{label}</span>
        {count > 0 && (
          <span className={`badge badge-sm ${countColorClass ?? 'badge-neutral'}`}>{count}</span>
        )}
      </div>
      {openSections.has(sectionKey)
        ? <ChevronUp className="w-4 h-4 text-base-content/40" />
        : <ChevronDown className="w-4 h-4 text-base-content/40" />}
    </button>
  )

  const EmptyState = ({ text }: { text: string }) => (
    <div className="px-4 py-3 flex items-center gap-2 text-sm text-success">
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      <span>{text}</span>
    </div>
  )

  // ── 5-Level matrix ──

  // If AI analysis hasn't run yet but we have parse location warnings, show minimal card
  if (!result && locationValidationWarnings.length > 0) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden mt-4">
        <div className="p-4 border-b border-base-300 bg-warning/5 border-warning/20">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-warning" />
            <div>
              <div className="font-bold text-base text-warning">Location Issues Detected</div>
              <div className="text-xs text-base-content/60 mt-0.5">{locationValidationWarnings.length} invalid value{locationValidationWarnings.length !== 1 ? 's' : ''} found in upload</div>
            </div>
          </div>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          {locationValidationWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1.5 px-2 rounded bg-warning/10">
              <span className="badge badge-xs badge-warning shrink-0 mt-0.5">Invalid value</span>
              <span className="text-base-content/70">{w}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden mt-4">

      {/* ── Score header ── */}
      <div className={`p-4 border-b border-base-300 ${scoreBg} border`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`text-4xl font-black ${scoreColor} leading-none`}>
              {result.overallScore}
              <span className="text-lg font-normal text-base-content/40">/100</span>
            </div>
            <div>
              <div className={`font-bold text-base ${scoreColor}`}>{scoreLabel}</div>
              <div className="text-xs text-base-content/60 mt-0.5">
                Analyzed {result.rowsAnalyzed} rows · Pay Intel Quality Check · AI-Powered
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              {result.issueCount.critical > 0 && (
                <span className="badge badge-error badge-sm">{result.issueCount.critical} Critical</span>
              )}
              {result.issueCount.warning > 0 && (
                <span className="badge badge-warning badge-sm">{result.issueCount.warning} Warnings</span>
              )}
              {result.issueCount.info > 0 && (
                <span className="badge badge-info badge-sm">{result.issueCount.info} Info</span>
              )}
            </div>
            <div className="text-xs text-right">
              {result.overallScore >= passingScore
                ? <span className="text-success font-semibold">✓ Passing — ready to submit</span>
                : <span className="text-error font-semibold">Score {result.overallScore}/{passingScore} needed to submit</span>
              }
            </div>
          </div>
        </div>
        <p className="text-sm text-base-content/70 mt-2">{result.summary}</p>
        {result.overallScore < passingScore && (() => {
          const tips: { label: string; count: number }[] = [
            { label: 'fix leveling prefixes', count: result.levelingIssues.length },
            { label: 'resolve missing data', count: result.missingDataRows.length },
            { label: 'remove duplicates', count: result.duplicates.length },
            { label: 'fix location issues', count: result.locationIssues.length + locationValidationWarnings.length },
          ].filter(t => t.count > 0).sort((a, b) => b.count - a.count).slice(0, 3)
          if (tips.length === 0) return null
          return (
            <div className="flex items-start gap-2 mt-2 text-xs text-base-content/70 bg-base-100/60 rounded-lg px-3 py-2 border border-base-300">
              <span className="shrink-0">💡</span>
              <span>
                <span className="font-semibold text-base-content">Fix these to reach {passingScore}:</span>{' '}
                {tips.map((t, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-base-content/30 mx-1">·</span>}
                    {t.label} <span className="font-semibold text-base-content">({t.count})</span>
                  </span>
                ))}
              </span>
            </div>
          )
        })()}
      </div>

      {/* ── Toolbar ── */}
      {totalIssues > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-base-200/40 border-b border-base-300 gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={expandAll}
              className="btn btn-xs btn-ghost gap-1 text-base-content/60 hover:text-base-content"
            >
              <ChevronsUpDown className="w-3 h-3" /> Expand all
            </button>
            <span className="text-base-content/20 select-none">|</span>
            <button
              type="button"
              onClick={collapseAll}
              className="btn btn-xs btn-ghost gap-1 text-base-content/60 hover:text-base-content"
            >
              <ChevronsDownUp className="w-3 h-3" /> Collapse all
            </button>
          </div>
          <button
            type="button"
            onClick={() => exportIssuesCSV(result, locationValidationWarnings)}
            className="btn btn-xs btn-ghost gap-1 text-primary hover:text-primary/80"
          >
            <Download className="w-3 h-3" /> Export issues CSV
          </button>
        </div>
      )}

      {/* ── Section 1: Duplicates ── */}
      <div className="border-b border-base-300">
        <SectionHeader sectionKey="duplicates" icon={Copy} label="Duplicate Job Titles" count={result.duplicates.length} />
        {openSections.has('duplicates') && (
          <div className="px-4 pb-3">
            {result.duplicates.length === 0 ? (
              <EmptyState text="No duplicates detected" />
            ) : (
              <ExpandableList
                items={result.duplicates}
                initialShow={4}
                renderItem={(d, i) => (
                  <div key={i} className={`rounded-lg p-3 border-l-4 bg-base-200/50 ${d.severity === 'critical' ? 'border-error' : 'border-warning'}`}>
                    <div className="flex items-start gap-2">
                      <span className={`badge badge-xs mt-0.5 shrink-0 ${d.severity === 'critical' ? 'badge-error' : 'badge-warning'}`}>
                        {d.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-base-content">{d.titles.join(' / ')}</div>
                        <div className="text-xs text-base-content/60 mt-0.5">{d.reason}</div>
                        <div className="text-xs text-primary mt-1">💡 {d.suggestion}</div>
                      </div>
                    </div>
                  </div>
                )}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Section 2: Leveling Issues ── */}
      <div className="border-b border-base-300 bg-base-200/20">
        <SectionHeader sectionKey="leveling" icon={Layers} label="Leveling Issues" count={result.levelingIssues.length} />
        {openSections.has('leveling') && (
          <div className="px-4 pb-3">
            <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mb-3 text-xs text-base-content/70">
              <span className="text-primary mt-0.5 shrink-0">ℹ️</span>
              <span><strong className="text-base-content">Pay Intel delivers all 5 levels automatically.</strong> Submit clean base titles only — e.g. <em>"Software Engineer"</em> not <em>"Senior Software Engineer"</em>. Exceptions: Manager, Director, VP, Head of, and other titles where seniority is inherent are correct as-is.</span>
            </div>
            {result.levelingIssues.length === 0 ? (
              <EmptyState text="All titles are clean base titles — no level modifiers found" />
            ) : (
              <ExpandableList
                items={result.levelingIssues}
                initialShow={4}
                renderItem={(issue, i) => (
                  <div key={i} className={`rounded-lg p-3 border-l-4 bg-base-200/50 ${
                    issue.severity === 'critical' ? 'border-error' : issue.severity === 'warning' ? 'border-warning' : 'border-info'
                  }`}>
                    <div className="font-semibold text-sm text-base-content">{issue.jobTitle}</div>
                    <div className="text-xs text-base-content/60 mt-0.5">{issue.issue}</div>
                    <div className="text-xs text-primary mt-1">💡 {issue.suggestion}</div>
                  </div>
                )}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Section 3: Missing Data ── */}
      <div className="border-b border-base-300 bg-base-200/20">
        <SectionHeader sectionKey="missing" icon={AlertTriangle} label="Missing Data" count={result.missingDataRows.length} />
        {openSections.has('missing') && (
          <div className="px-4 pb-3">
            {result.missingDataRows.length === 0 ? (
              <EmptyState text="All rows have required data" />
            ) : (
              <>
                <ScrollableContainer maxRows={7}>
                  <table className="table table-xs w-full">
                    <thead className="sticky top-0 bg-base-200 z-10">
                      <tr>
                        <th className="text-base-content/60">Row</th>
                        <th className="text-base-content/60">Job Title</th>
                        <th className="text-base-content/60">Missing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.missingDataRows.map((row, i) => (
                        <tr key={i} className="hover:bg-base-200/40 transition-colors">
                          <td className="text-xs text-base-content/50">#{row.rowIndex}</td>
                          <td className="text-xs font-medium text-base-content">
                            <span className="truncate block max-w-[180px]" title={row.jobTitle}>{row.jobTitle}</span>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {row.missing.map(m => (
                                <span key={m} className={`badge badge-xs ${row.severity === 'critical' ? 'badge-error' : 'badge-warning'}`}>
                                  {m}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableContainer>
                {result.missingDataRows.length > 7 && (
                  <div className="text-xs text-base-content/40 pt-2 px-1">
                    Showing all {result.missingDataRows.length} rows — scroll to see more
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Section 4: Location Issues ── */}
      <div>
                {/* ── Multi-Location Rows ─────────────────────────────────── */}
        {(result.multiLocationRows || []).length > 0 && (
          <div className="rounded-xl border-2 border-error/40 bg-error/5 overflow-hidden">
            <SectionHeader
              sectionKey="multiloc"
              icon={SplitSquareVertical}
              label="Multi-Location Rows"
              count={(result.multiLocationRows || []).length}
              countColorClass="bg-error/15 text-error"
            />
            {openSections.has('multiloc') && (
              <div className="p-4 space-y-3">
                {/* Explanation banner */}
                <div className="flex gap-3 p-3 rounded-lg bg-error/10 border border-error/25">
                  <AlertCircle className="w-4 h-4 text-error mt-0.5 shrink-0" />
                  <div className="text-xs text-base-content/80 leading-relaxed">
                    <span className="font-semibold text-error">Structural Error — Action Required.</span>{' '}
                    Each row must contain exactly <span className="font-semibold">one location</span> (one state, one city).
                    Rows with combined values like <span className="font-mono bg-base-200 px-1 rounded">"Kentucky &amp; Indiana"</span> must be
                    split into separate rows — one per state/city — each with the full job title, description, and country.
                    Pay Intel cannot process multi-location rows correctly.
                  </div>
                </div>
                {/* Group by unique value */}
                {(() => {
                  const grouped = new Map<string, typeof result.multiLocationRows>()
                  for (const r of (result.multiLocationRows || [])) {
                    const key = `${r.field}:${r.value}`
                    if (!grouped.has(key)) grouped.set(key, [])
                    grouped.get(key)!.push(r)
                  }
                  return Array.from(grouped.entries()).map(([key, rows]) => {
                    const first = rows[0]
                    return (
                      <div key={key} className="rounded-lg border border-error/20 bg-base-100 overflow-hidden">
                        <div className="flex items-start gap-3 p-3">
                          <div className="w-1.5 self-stretch rounded-full bg-error shrink-0" />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-error/70 bg-error/10 px-2 py-0.5 rounded">
                                {first.field}
                              </span>
                              <span className="font-mono text-sm font-semibold text-base-content">
                                "{first.value}"
                              </span>
                              <span className="text-xs text-base-content/50">
                                affects {rows.length} row{rows.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 items-center">
                              <span className="text-xs text-base-content/60 mr-1">Split into:</span>
                              {first.detectedLocations.map((loc, i) => (
                                <span key={i} className="text-xs bg-base-200 text-base-content px-2 py-0.5 rounded-full font-medium">
                                  {loc}
                                </span>
                              ))}
                            </div>
                            <details className="mt-1">
                              <summary className="text-xs text-base-content/50 cursor-pointer hover:text-base-content/70 select-none">
                                Show affected rows ({rows.length})
                              </summary>
                              <div className="mt-1.5 space-y-1 pl-1">
                                {rows.map((r, i) => (
                                  <div key={i} className="text-xs text-base-content/60 flex gap-2">
                                    <span className="text-base-content/40 tabular-nums">Row {r.rowIndex}</span>
                                    <span className="truncate">{r.jobTitle}</span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </div>
        )}

        <SectionHeader sectionKey="location" icon={MapPin} label="Location Issues" count={(result?.locationIssues.length ?? 0) + locationValidationWarnings.length} />
        {openSections.has('location') && (
          <div className="px-4 pb-3 space-y-2">
            {/* Parser-level validation warnings (work arrangements, invalid states) */}
            {locationValidationWarnings.length > 0 && (
              <div className="space-y-1">
                {locationValidationWarnings.map((w, i) => (
                  <div
                    key={`parse-${i}`}
                    className="flex items-start gap-2 text-xs py-1.5 px-2 rounded bg-warning/10"
                  >
                    <span className="badge badge-xs badge-warning shrink-0 mt-0.5">Invalid value</span>
                    <span className="text-base-content/70">{w}</span>
                  </div>
                ))}
              </div>
            )}
            {/* AI-detected location issues */}
            {result && result.locationIssues.length === 0 && locationValidationWarnings.length === 0 && (
              <EmptyState text="Location data looks complete" />
            )}
            {result && result.locationIssues.length === 0 && locationValidationWarnings.length > 0 && (
              <div className="px-2 py-1 text-xs text-base-content/40">No additional AI-detected location issues</div>
            )}
            {result && result.locationIssues.length > 0 && (
              <ScrollableContainer maxRows={8}>
                <div className="space-y-1">
                  {result.locationIssues.map((loc, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 text-xs py-1.5 px-2 rounded ${loc.severity === 'critical' ? 'bg-error/10' : 'bg-warning/10'}`}
                    >
                      <span className="text-base-content/40 shrink-0">#{loc.rowIndex}</span>
                      <span className="font-medium text-base-content shrink-0 truncate max-w-[140px]" title={loc.jobTitle}>
                        {loc.jobTitle}
                      </span>
                      <span className="text-base-content/60">{loc.issue}</span>
                    </div>
                  ))}
                </div>
              </ScrollableContainer>
            )}
            {!result && locationValidationWarnings.length === 0 && (
              <EmptyState text="Location data looks complete" />
            )}
          </div>
        )}
      </div>

    </div>
  )
}
