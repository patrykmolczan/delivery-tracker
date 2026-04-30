import React, { useState } from 'react'
import { Zap, Copy, Layers, BarChart3, AlertTriangle, MapPin, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import type { TemplateQualityResult } from '../lib/templateQualityAnalyzer'

interface Props {
  result: TemplateQualityResult | null
  isLoading: boolean
}

export function TemplateQualityReview({ result, isLoading }: Props) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['duplicates', 'leveling', 'coverage', 'missing', 'location']))

  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!isLoading && !result) return null

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden mt-4 animate-pulse">
        <div className="p-4 flex items-center gap-3 border-b border-base-300 bg-base-200/60">
          <Zap className="w-5 h-5 text-primary animate-spin" />
          <span className="font-semibold text-base-content">Analyzing template quality with AI…</span>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-4 bg-base-300 rounded w-full" style={{ width: `${70 + i * 10}%` }} />)}
        </div>
      </div>
    )
  }

  if (!result) return null

  // Analysis failed
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

  // Score color
  const scoreColor = result.overallScore >= 80 ? 'text-success' : result.overallScore >= 60 ? 'text-warning' : 'text-error'
  const scoreBg = result.overallScore >= 80 ? 'bg-success/10 border-success/30' : result.overallScore >= 60 ? 'bg-warning/10 border-warning/30' : 'bg-error/10 border-error/30'
  const scoreLabel = result.overallScore >= 90 ? 'Excellent' : result.overallScore >= 80 ? 'Good' : result.overallScore >= 60 ? 'Needs Review' : result.overallScore >= 40 ? 'Poor Quality' : 'Rework Required'

  // Section header helper
  const SectionHeader = ({ sectionKey, icon: Icon, label, count }: { sectionKey: string; icon: React.ElementType; label: string; count: number }) => (
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
      {openSections.has(sectionKey) ? <ChevronUp className="w-4 h-4 text-base-content/40" /> : <ChevronDown className="w-4 h-4 text-base-content/40" />}
    </button>
  )

  const EmptyState = ({ text }: { text: string }) => (
    <div className="px-4 py-3 flex items-center gap-2 text-sm text-success">
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      <span>{text}</span>
    </div>
  )

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 overflow-hidden mt-4">
      {/* Score header */}
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
                Analyzed {result.rowsAnalyzed} rows · Pay Intel 5-Level Check · AI-Powered
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
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

      {/* Section 1: Duplicates */}
      <div className="border-b border-base-300">
        <SectionHeader sectionKey="duplicates" icon={Copy} label="Duplicate Job Titles" count={result.duplicates.length} />
        {openSections.has('duplicates') && (
          <div className="px-4 pb-3">
            {result.duplicates.length === 0 ? (
              <EmptyState text="No duplicates detected" />
            ) : (
              <div className="space-y-2">
                {result.duplicates.map((d, i) => (
                  <div key={i} className={`rounded-lg p-3 border-l-4 bg-base-200/50 ${d.severity === 'critical' ? 'border-error' : 'border-warning'}`}>
                    <div className="flex items-start gap-2">
                      <span className={`badge badge-xs mt-0.5 shrink-0 ${d.severity === 'critical' ? 'badge-error' : 'badge-warning'}`}>{d.severity}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-base-content">{d.titles.join(' · ')}</div>
                        <div className="text-xs text-base-content/60 mt-0.5">{d.reason}</div>
                        <div className="text-xs text-primary mt-1">💡 {d.suggestion}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Leveling Issues */}
      <div className="border-b border-base-300 bg-base-200/20">
        <SectionHeader sectionKey="leveling" icon={Layers} label="Leveling Issues" count={result.levelingIssues.length} />
        {openSections.has('leveling') && (
          <div className="px-4 pb-3">
            {result.levelingIssues.length === 0 ? (
              <EmptyState text="Leveling looks consistent" />
            ) : (
              <div className="space-y-2">
                {result.levelingIssues.map((issue, i) => (
                  <div key={i} className={`rounded-lg p-3 border-l-4 bg-base-200/50 ${issue.severity === 'critical' ? 'border-error' : issue.severity === 'warning' ? 'border-warning' : 'border-info'}`}>
                    <div className="font-semibold text-sm text-base-content">{issue.jobTitle}</div>
                    <div className="text-xs text-base-content/60 mt-0.5">{issue.issue}</div>
                    <div className="text-xs text-primary mt-1">💡 {issue.suggestion}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 3: 5-Level Coverage */}
      <div className="border-b border-base-300">
        <SectionHeader sectionKey="coverage" icon={BarChart3} label="Pay Intel 5-Level Coverage" count={result.levelCoverage.filter(c => c.missingLevels.length > 0).length} />
        {openSections.has('coverage') && (
          <div className="px-4 pb-3">
            <div className="text-xs text-base-content/50 mb-2 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Pay Intel delivers 5 pricing levels: Junior · Intermediate · Senior · Lead · Guru
            </div>
            {result.levelCoverage.length === 0 ? (
              <div className="text-sm text-base-content/50 py-2">ℹ️ Not enough data to analyze level coverage</div>
            ) : (
              <div className="space-y-2">
                {result.levelCoverage.map((cov, i) => (
                  <div key={i} className="rounded-lg p-3 bg-base-200/50">
                    <div className="font-semibold text-sm text-base-content mb-1">{cov.jobFamily}</div>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {cov.foundLevels.map(l => <span key={l} className="badge badge-success badge-xs">{l}</span>)}
                      {cov.missingLevels.map(l => <span key={l} className="badge badge-error badge-xs opacity-60">{l} missing</span>)}
                    </div>
                    <div className="text-xs text-primary">💡 {cov.suggestion}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 4: Missing Data */}
      <div className="border-b border-base-300 bg-base-200/20">
        <SectionHeader sectionKey="missing" icon={AlertTriangle} label="Missing Data" count={result.missingDataRows.length} />
        {openSections.has('missing') && (
          <div className="px-4 pb-3">
            {result.missingDataRows.length === 0 ? (
              <EmptyState text="All rows have required data" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-xs w-full">
                  <thead>
                    <tr>
                      <th className="text-base-content/60">Row</th>
                      <th className="text-base-content/60">Job Title</th>
                      <th className="text-base-content/60">Missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.missingDataRows.slice(0, 20).map((row, i) => (
                      <tr key={i}>
                        <td className="text-xs text-base-content/50">#{row.rowIndex}</td>
                        <td className="text-xs font-medium text-base-content truncate max-w-[180px]">{row.jobTitle}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {row.missing.map(m => (
                              <span key={m} className={`badge badge-xs ${row.severity === 'critical' ? 'badge-error' : 'badge-warning'}`}>{m}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.missingDataRows.length > 20 && (
                  <div className="text-xs text-base-content/40 pt-2">…and {result.missingDataRows.length - 20} more rows</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 5: Location Issues */}
      <div>
        <SectionHeader sectionKey="location" icon={MapPin} label="Location Issues" count={result.locationIssues.length} />
        {openSections.has('location') && (
          <div className="px-4 pb-3">
            {result.locationIssues.length === 0 ? (
              <EmptyState text="Location data looks complete" />
            ) : (
              <div className="space-y-1">
                {result.locationIssues.slice(0, 15).map((loc, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs py-1.5 px-2 rounded ${loc.severity === 'critical' ? 'bg-error/10' : 'bg-warning/10'}`}>
                    <span className="text-base-content/40 shrink-0">#{loc.rowIndex}</span>
                    <span className="font-medium text-base-content shrink-0">{loc.jobTitle}</span>
                    <span className="text-base-content/60">{loc.issue}</span>
                  </div>
                ))}
                {result.locationIssues.length > 15 && (
                  <div className="text-xs text-base-content/40 pt-1">…and {result.locationIssues.length - 15} more</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
