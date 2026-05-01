import React, { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, ArrowUp, ArrowDown, Edit2, Globe } from 'lucide-react'
import type { Project, SortState, SortField } from '../types'
import { formatDate, getStatusColor } from '../lib/data'

interface ProjectTableProps {
  projects: Project[]
  sort: SortState
  onSort: (sort: SortState) => void
  onSelectProject: (project: Project) => void
  selectedId: string | null
  onEdit?: (project: Project) => void
  canEditProject?: (project: Project) => boolean
  countriesMap?: Map<string, string[]>
}

const ROW_HEIGHT = 44

const columns: { key: SortField; label: string }[] = [
  { key: 'id_number', label: 'ID #' },
  { key: 'status', label: 'Status' },
  { key: 'project_owner', label: 'Owner' },
  { key: 'analyst', label: 'Analyst' },
  { key: 'client_type', label: 'Client Type' },
  { key: 'client_name', label: 'Client' },
  { key: 'requestor', label: 'Requestor' },
  { key: 'date_received', label: 'Received' },
  { key: 'expected_delivery_date', label: 'Due Date' },
  { key: 'date_delivered', label: 'Delivered' },
  { key: 'days_to_complete', label: 'Days' },
  { key: 'country', label: 'Country' },
  { key: 'industry', label: 'Industry' },
  { key: 'job_count', label: 'Jobs' },
]

// Column widths as percentages — must sum to 100 (without Actions col)
// With Actions col the last col takes 5% and others shrink proportionally via table-fixed
const COL_WIDTHS = {
  id_number: '3%',       // -1% (narrow ID fits in 3%)
  status: '10%',         // +3% — fits "Ready to Deliver" / "SKV Validation" without truncation
  project_owner: '7%',
  analyst: '6%',
  client_type: '8%',
  client_name: '12%',
  requestor: '7%',
  date_received: '7%',
  expected_delivery_date: '7%',
  date_delivered: '7%',
  days_to_complete: '3%', // -1% (short numbers fit fine)
  country: '8%',
  industry: '9%',
  job_count: '2%',        // -1% (single digits only)
  actions: '4%',
}

// ─── Country hover popover ─────────────────────────────────────────────────────
interface PopoverState {
  countries: string[]
  rect: DOMRect
}

const CountryPopover: React.FC<{
  popover: PopoverState
  onMouseEnter: () => void
  onMouseLeave: () => void
}> = ({ popover, onMouseEnter, onMouseLeave }) => {
  const POPOVER_W = 260
  const headerH = 44
  const rowH = 32
  const estimatedH = Math.min(popover.countries.length * rowH + headerH + 12, 344)

  const vp = { w: window.innerWidth, h: window.innerHeight }
  const left = Math.min(popover.rect.left, vp.w - POPOVER_W - 8)
  const fitsBelow = popover.rect.bottom + 6 + estimatedH <= vp.h
  const top = fitsBelow
    ? popover.rect.bottom + 6
    : popover.rect.top - estimatedH - 6

  return createPortal(
    <div
      className="fixed z-[9999] bg-base-100 border border-base-300 rounded-xl shadow-2xl overflow-hidden"
      style={{ top, left, width: POPOVER_W }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-base-300 bg-base-200">
        <Globe size={13} className="text-primary shrink-0" />
        <span className="text-xs font-bold uppercase tracking-widest text-base-content/60">
          {popover.countries.length} {popover.countries.length === 1 ? 'Country' : 'Countries'}
        </span>
      </div>
      {/* Scrollable list */}
      <div className="overflow-y-auto max-h-72 py-1.5 px-2">
        {popover.countries.map((c, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-base-200 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
            <span className="text-sm text-base-content/85 leading-tight">{c}</span>
          </div>
        ))}
      </div>
    </div>,
    document.body
  )
}

// ─── Row status left-border color ─────────────────────────────────────────────
const getRowBorderClass = (status: string): string => {
  switch (status) {
    case 'Completed':  return 'border-l-2 border-l-success'
    case 'In Process': return 'border-l-2 border-l-info'
    case 'Overdue':    return 'border-l-2 border-l-error'
    case 'On Hold':    return 'border-l-2 border-l-warning'
    case 'Cancelled':  return 'border-l-2 border-l-base-content/25'
    default:           return 'border-l-2 border-l-base-300'
  }
}

// ─── Main component ────────────────────────────────────────────────────────────
export const ProjectTable: React.FC<ProjectTableProps> = ({
  projects,
  sort,
  onSort,
  onSelectProject,
  selectedId,
  onEdit,
  canEditProject,
  countriesMap,
}) => {
  const parentRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [popover, setPopover] = useState<PopoverState | null>(null)

  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  const handleSort = (field: SortField) => {
    onSort({
      field,
      direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sort.field !== field) return <ArrowUpDown size={10} className="opacity-25 flex-shrink-0" />
    return sort.direction === 'asc' ? (
      <ArrowUp size={10} className="text-primary flex-shrink-0" />
    ) : (
      <ArrowDown size={10} className="text-primary flex-shrink-0" />
    )
  }

  const isOverdue = (p: Project) => {
    if (['Completed', 'Cancelled'].includes(p.status)) return false
    if (!p.expected_delivery_date) return false
    return p.expected_delivery_date < new Date().toISOString().slice(0, 10)
  }

  const showPopover = (e: React.MouseEvent<HTMLTableCellElement>, countries: string[]) => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setPopover({ countries, rect: e.currentTarget.getBoundingClientRect() })
  }

  const scheduleHide = () => {
    hideTimer.current = setTimeout(() => setPopover(null), 180)
  }

  const cancelHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }

  const colCount = columns.length + (onEdit ? 1 : 0)

  return (
    <div className="space-y-2">
      {/* Row count */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-base-content/50">
          Showing{' '}
          <span className="font-semibold text-base-content/70">
            {projects.length.toLocaleString()}
          </span>{' '}
          project{projects.length !== 1 ? 's' : ''}
        </span>
        {projects.length > 20 && (
          <span className="text-xs text-base-content/35 flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
            Scroll to see all
          </span>
        )}
      </div>

      {/* Table wrapper */}
      <div className="rounded-xl border border-base-300/50 bg-base-200 overflow-hidden">
        <div
          ref={parentRef}
          className="overflow-y-auto overflow-x-hidden"
          style={{ height: 'calc(100vh - 310px)', minHeight: '420px' }}
        >
          {/* table-fixed + w-full = columns share available width, no horizontal scroll */}
          <table className="table table-sm table-fixed w-full">
            <colgroup>
              {columns.map(col => (
                <col key={col.key} style={{ width: COL_WIDTHS[col.key as keyof typeof COL_WIDTHS] }} />
              ))}
              {onEdit && <col style={{ width: COL_WIDTHS.actions }} />}
            </colgroup>

            {/* ── Sticky header ─────────────────────────────────────────────── */}
            <thead className="sticky top-0 z-20">
              <tr className="bg-base-300 border-b-2 border-base-content/10">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className="cursor-pointer select-none px-2 py-3 transition-colors hover:bg-primary/10 group"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-base-content/50 group-hover:text-primary transition-colors whitespace-nowrap">
                        {col.label}
                      </span>
                      <SortIcon field={col.key} />
                    </span>
                  </th>
                ))}
                {onEdit && (
                  <th className="px-2 py-3">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-base-content/50">
                      Actions
                    </span>
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-16 text-base-content/40">
                    No projects match your filters
                  </td>
                </tr>
              ) : (
                <>
                  {paddingTop > 0 && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={colCount}
                        style={{ height: paddingTop, padding: 0, border: 'none' }}
                      />
                    </tr>
                  )}

                  {virtualItems.map(virtualRow => {
                    const p = projects[virtualRow.index]
                    // Resolve all countries: prefer multi-country map, fall back to legacy single-country field
                    const allCountries = (countriesMap?.get(p.id) && countriesMap.get(p.id)!.length > 0)
                      ? countriesMap.get(p.id)!
                      : (p.country ? [p.country] : [])
                    const hasMultiple = allCountries.length > 1

                    return (
                      <tr
                        key={p.id}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        className={[
                          'cursor-pointer hover:bg-primary/5 transition-colors',
                          selectedId === p.id ? 'bg-primary/10' : '',
                          getRowBorderClass(p.status),
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => onSelectProject(p)}
                        style={{ height: ROW_HEIGHT }}
                      >
                        {/* ID # */}
                        <td className="text-base-content/60 font-mono text-xs overflow-hidden">
                          <span className="block truncate">{p.id_number ?? '—'}</span>
                        </td>

                        {/* Status */}
                        <td className="overflow-hidden">
                          <span
                            className={`badge badge-sm ${getStatusColor(p.status)} font-medium whitespace-nowrap inline-flex items-center`}
                          >
                            {p.status}
                          </span>
                        </td>

                        {/* Owner */}
                        <td className="font-medium text-base-content overflow-hidden">
                          <span className="block truncate" title={p.project_owner ?? ''}>
                            {p.project_owner || '—'}
                          </span>
                        </td>

                        {/* Analyst */}
                        <td className="text-base-content/70 overflow-hidden">
                          <span className="block truncate" title={p.analyst ?? ''}>
                            {p.analyst || '—'}
                          </span>
                        </td>

                        {/* Client Type */}
                        <td className="text-base-content/70 overflow-hidden">
                          <span className="block truncate" title={p.client_type ?? ''}>
                            {p.client_type || '—'}
                          </span>
                        </td>

                        {/* Client */}
                        <td className="font-medium text-base-content overflow-hidden">
                          <span className="block truncate" title={p.client_name ?? ''}>
                            {p.client_name}
                          </span>
                        </td>

                        {/* Requestor */}
                        <td className="text-base-content/70 overflow-hidden">
                          <span className="block truncate" title={p.requestor ?? ''}>
                            {p.requestor || '—'}
                          </span>
                        </td>

                        {/* Received */}
                        <td className="text-base-content/70 text-xs overflow-hidden">
                          <span className="block truncate">{formatDate(p.date_received)}</span>
                        </td>

                        {/* Due Date */}
                        <td
                          className={`text-xs overflow-hidden ${
                            isOverdue(p)
                              ? 'text-error font-semibold'
                              : 'text-base-content/70'
                          }`}
                        >
                          <span className="block truncate">{formatDate(p.expected_delivery_date)}</span>
                        </td>

                        {/* Delivered */}
                        <td className="text-base-content/70 text-xs overflow-hidden">
                          <span className="block truncate">{formatDate(p.date_delivered)}</span>
                        </td>

                        {/* Days — negative = early (green), 0 = on time, positive = late */}
                        <td className="text-center overflow-hidden">
                          {p.days_to_complete != null ? (() => {
                            const d = p.days_to_complete as number
                            if (d < 0) return (
                              <span className="badge badge-sm badge-success badge-outline whitespace-nowrap font-semibold">
                                {Math.abs(d)}d early
                              </span>
                            )
                            if (d === 0) return (
                              <span className="badge badge-sm badge-ghost badge-outline whitespace-nowrap font-semibold">
                                On time
                              </span>
                            )
                            return (
                              <span className={`badge badge-sm ${d <= 14 ? 'badge-warning' : 'badge-error'} badge-outline whitespace-nowrap font-semibold`}>
                                {d}d
                              </span>
                            )
                          })() : (
                            <span className="text-base-content/40">—</span>
                          )}
                        </td>

                        {/* Country — hover to see all */}
                        <td
                          className="text-base-content/70 overflow-hidden"
                          onMouseEnter={(e) => {
                            if (hasMultiple) showPopover(e, allCountries)
                          }}
                          onMouseLeave={scheduleHide}
                        >
                          <div className="flex items-center gap-1 overflow-hidden">
                            <span
                              className="min-w-0 flex-1 truncate text-xs"
                              title={allCountries[0] ?? ''}
                            >
                              {allCountries[0] || '—'}
                            </span>
                            {hasMultiple && (
                              <span className="badge badge-xs badge-primary shrink-0 font-semibold cursor-default">
                                +{allCountries.length - 1}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Industry */}
                        <td className="text-base-content/70 overflow-hidden">
                          <span className="block truncate" title={p.industry ?? ''}>
                            {p.industry || '—'}
                          </span>
                        </td>

                        {/* Jobs */}
                        <td className="text-center text-base-content/70 overflow-hidden">
                          <span className="block truncate">{p.job_count ?? '—'}</span>
                        </td>

                        {/* Actions */}
                        {onEdit && (
                          <td onClick={e => e.stopPropagation()} className="overflow-hidden">
                            {(!canEditProject || canEditProject(p)) && (
                              <button
                                className="btn btn-ghost btn-xs gap-1"
                                onClick={() => onEdit(p)}
                              >
                                <Edit2 size={11} /> Edit
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}

                  {paddingBottom > 0 && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={colCount}
                        style={{ height: paddingBottom, padding: 0, border: 'none' }}
                      />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Country hover popover — rendered in document.body via portal */}
      {popover && (
        <CountryPopover
          popover={popover}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        />
      )}
    </div>
  )
}
