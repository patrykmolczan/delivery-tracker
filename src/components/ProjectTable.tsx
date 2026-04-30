import React, { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, ArrowUp, ArrowDown, Edit2 } from 'lucide-react'
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

export const ProjectTable: React.FC<ProjectTableProps> = ({
  projects,
  sort,
  onSort,
  onSelectProject,
  selectedId,
  onEdit,
  canEditProject,
}) => {
  const parentRef = useRef<HTMLDivElement>(null)

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
    if (sort.field !== field) return <ArrowUpDown size={12} className="opacity-30" />
    return sort.direction === 'asc' ? (
      <ArrowUp size={12} className="text-primary" />
    ) : (
      <ArrowDown size={12} className="text-primary" />
    )
  }

  const isOverdue = (p: Project) => {
    if (['Completed', 'Cancelled'].includes(p.status)) return false
    if (!p.expected_delivery_date) return false
    return p.expected_delivery_date < new Date().toISOString().slice(0, 10)
  }

  const colCount = columns.length + (onEdit ? 1 : 0)

  return (
    <div className="space-y-2">
      {/* Row count + hint */}
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
        {/* Horizontal + vertical scroll container */}
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ height: 'calc(100vh - 310px)', minHeight: '420px' }}
        >
          <table className="table table-sm min-w-full">
            {/* Sticky header */}
            <thead className="sticky top-0 z-20">
              <tr className="bg-base-300/95 backdrop-blur-sm shadow-sm">
                {columns.map(col => (
                  <th
                    key={col.key}
                    className="cursor-pointer hover:bg-base-300 transition-colors text-xs uppercase tracking-wider font-semibold whitespace-nowrap select-none"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      <SortIcon field={col.key} />
                    </span>
                  </th>
                ))}
                {onEdit && (
                  <th className="text-xs uppercase tracking-wider font-semibold whitespace-nowrap">
                    Actions
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
                  {/* Top spacer — fills space above rendered rows */}
                  {paddingTop > 0 && (
                    <tr aria-hidden="true">
                      <td
                        colSpan={colCount}
                        style={{ height: paddingTop, padding: 0, border: 'none' }}
                      />
                    </tr>
                  )}

                  {/* Only the visible rows */}
                  {virtualItems.map(virtualRow => {
                    const p = projects[virtualRow.index]
                    return (
                      <tr
                        key={p.id}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        className={[
                          'cursor-pointer hover:bg-primary/5 transition-colors',
                          selectedId === p.id ? 'bg-primary/10' : '',
                          isOverdue(p) ? 'border-l-2 border-l-error' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => onSelectProject(p)}
                        style={{ height: ROW_HEIGHT }}
                      >
                        <td className="text-base-content/60 whitespace-nowrap font-mono text-xs">
                          {p.id_number ?? '—'}
                        </td>
                        <td className="whitespace-nowrap">
                          <span
                            className={`badge badge-sm ${getStatusColor(
                              p.status
                            )} font-medium whitespace-nowrap inline-flex items-center`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="font-medium text-base-content whitespace-nowrap">
                          {p.project_owner}
                        </td>
                        <td className="text-base-content/70 whitespace-nowrap">
                          {p.analyst || '—'}
                        </td>
                        <td className="text-base-content/70 whitespace-nowrap">
                          {p.client_type || '—'}
                        </td>
                        <td className="font-medium text-base-content whitespace-nowrap max-w-[180px] truncate">
                          {p.client_name}
                        </td>
                        <td className="text-base-content/70 whitespace-nowrap">
                          {p.requestor || '—'}
                        </td>
                        <td className="text-base-content/70 whitespace-nowrap">
                          {formatDate(p.date_received)}
                        </td>
                        <td
                          className={`whitespace-nowrap ${
                            isOverdue(p)
                              ? 'text-error font-semibold'
                              : 'text-base-content/70'
                          }`}
                        >
                          {formatDate(p.expected_delivery_date)}
                        </td>
                        <td className="text-base-content/70 whitespace-nowrap">
                          {formatDate(p.date_delivered)}
                        </td>
                        <td className="text-center whitespace-nowrap">
                          {p.days_to_complete != null ? (
                            <span
                              className={`badge badge-sm ${
                                p.days_to_complete <= 14
                                  ? 'badge-success'
                                  : p.days_to_complete <= 30
                                  ? 'badge-warning'
                                  : 'badge-error'
                              } badge-outline`}
                            >
                              {p.days_to_complete}d
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="text-base-content/70 whitespace-nowrap">
                          {p.country || '—'}
                        </td>
                        <td className="text-base-content/70 whitespace-nowrap">
                          {p.industry || '—'}
                        </td>
                        <td className="text-center text-base-content/70 whitespace-nowrap">
                          {p.job_count ?? '—'}
                        </td>
                        {onEdit && (
                          <td onClick={e => e.stopPropagation()} className="whitespace-nowrap">
                            {(!canEditProject || canEditProject(p)) && (
                              <button
                                className="btn btn-ghost btn-xs gap-1"
                                onClick={() => onEdit(p)}
                              >
                                <Edit2 size={12} /> Edit
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}

                  {/* Bottom spacer — fills space below rendered rows */}
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
    </div>
  )
}
