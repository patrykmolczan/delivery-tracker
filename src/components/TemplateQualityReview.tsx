import React, { useState, useCallback } from 'react'
import {
  Zap, Copy, Layers, AlertTriangle, MapPin,
  ChevronDown, ChevronUp, CheckCircle2, AlertCircle,
  ChevronsUpDown, ChevronsDownUp, Download
} from 'lucide-react'
import type { TemplateQualityResult } from '../lib/templateQualityAnalyzer'

interface Props {
  result: TemplateQualityResult | null
  isLoading: boolean
}


// ─── Export helper ────────────────────────────────────────────────────────────
function exportIssuesCSV(result: TemplateQualityResult) {
  const rows: string[][] = [['Category', 'Severity', 'Job Title / Detail', 'Issue', 'Suggestion']]

  result.duplicates.forEach(d => {
    rows.push(['Duplicate', d.severity, d.titles.join(' / '), d.reason, d.suggestion])
  })
  result.levelingIssues.forEach(l => {
    rows.push(['Leveling', l.severity, l.jobTitle, l.issue, l.suggestion])
  })
  result.missingDataRows.forEach(m => {
    rows.push(['Missing Data', m.severity, m.jobTitle, `Missing: ${m.missing.join(', ')}`, ''])
  })
  result.locationIssues.forEach(l => {
    rows.push(['Location', l.severity, l.jobTitle, l.issue, ''])
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
export function TemplateQualityReview({ result, isLoading }: Props) {
  // Auto-open sections that have issues; empty sections start closed
  const getInitialOpen = useCallback(() => {
    if (!result) return new Set<string>(['duplicates', 'leveling', 'missing', 'location'])
    const open = new Set<string>()
    if (result.duplicates.length > 0) open.add('duplicates')
    if (result.levelingIssues.length > 0) open.add('leveling')
    if (result.missingDataRows.length > 0) open.add('missing')
    if (result.locationIssues.length > 0) open.add('location')
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

  if (!isLoading && !result) return null

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
  const scoreColor = result.overallScore >= 80 ? 'text-success' : result.overallScore >= 60 ? 'text-warning' : 'text-error'
  const scoreBg    = result.overallScore >= 80 ? 'bg-success/10 border-success/30' : result.overallScore >= 60 ? 'bg-warning/10 border-warning/30' : 'bg-error/10 border-error/30'
  const scoreLabel = result.overallScore >= 90 ? 'Excellent' : result.overallScore >= 80 ? 'Good' : result.overallScore >= 60 ? 'Needs Review' : result.overallScore >= 40 ? 'Poor Quality' : 'Rework Required'

  const totalIssues = result.issueCount.critical + result.issueCount.warning + result.issueCount.info

  // ── Section header ──
  const SectionHeader = ({
    sectionKey, icon: Icon, label, count
  }: { sectionKey: string; icon: React.ElementType; label: string; count: number }) => (
    <button
      type="button"
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-base-200/60 transition-colors"
    >
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-base-content/60" />
        <span className="font-medium text-sm text-base-content">{label}</span>
        {count > 0 && <span className="badge badge-sm badge-neutral">{count}</span>}
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
            <div className="text-xs text-base-content/50 text-right">Advisory — you can still submit</div>
          </div>
        </div>
        <p className="text-sm text-base-content/70 mt-2">{result.summary}</p>
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
            onClick={() => exportIssuesCSV(result)}
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
        <SectionHeader sectionKey="location" icon={MapPin} label="Location Issues" count={result.locationIssues.length} />
        {openSections.has('location') && (
          <div className="px-4 pb-3">
            {result.locationIssues.length === 0 ? (
              <EmptyState text="Location data looks complete" />
            ) : (
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
          </div>
        )}
      </div>

    </div>
  )
}
