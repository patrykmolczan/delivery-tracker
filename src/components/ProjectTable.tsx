import React from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Edit2 } from 'lucide-react'
import type { Project, SortState, SortField } from '../types'
import { formatDate, getStatusColor } from '../lib/data'

interface ProjectTableProps {
  projects: Project[]
  sort: SortState
  onSort: (sort: SortState) => void
  onSelectProject: (project: Project) => void
  selectedId: string | null
  onEdit?: (project: Project) => void
}

const PAGE_SIZE = 25

const columns: { key: SortField; label: string }[] = [
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

export const ProjectTable: React.FC<ProjectTableProps> = ({ projects, sort, onSort, onSelectProject, selectedId, onEdit }) => {
  const [page, setPage] = React.useState(0)
  const totalPages = Math.ceil(projects.length / PAGE_SIZE)
  const paged = projects.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  React.useEffect(() => { setPage(0) }, [projects.length])

  const handleSort = (field: SortField) => {
    onSort({ field, direction: sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc' })
  }

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sort.field !== field) return <ArrowUpDown size={12} className="opacity-30" />
    return sort.direction === 'asc' ? <ArrowUp size={12} className="text-primary" /> : <ArrowDown size={12} className="text-primary" />
  }

  const isOverdue = (p: Project) => {
    if (['Completed', 'Cancelled'].includes(p.status)) return false
    if (!p.expected_delivery_date) return false
    return p.expected_delivery_date < new Date().toISOString().slice(0, 10)
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-base-300/50 bg-base-200">
        <table className="table table-sm w-full">
          <thead>
            <tr className="bg-base-300/50">
              {columns.map(col => (
                <th
                  key={col.key}
                  className="cursor-pointer hover:bg-base-300 transition-colors text-xs uppercase tracking-wider font-semibold whitespace-nowrap select-none"
                  onClick={() => handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">{col.label} <SortIcon field={col.key} /></span>
                </th>
              ))}
              {onEdit && <th className="text-xs uppercase tracking-wider font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {paged.map(p => (
              <tr
                key={p.id}
                className={`cursor-pointer hover:bg-primary/5 transition-colors ${selectedId === p.id ? 'bg-primary/10' : ''} ${isOverdue(p) ? 'border-l-2 border-l-error' : ''}`}
                onClick={() => onSelectProject(p)}
              >
                <td className="whitespace-nowrap"><span className={`badge badge-sm ${getStatusColor(p.status)} font-medium whitespace-nowrap inline-flex items-center`}>{p.status}</span></td>
                <td className="font-medium text-base-content">{p.project_owner}</td>
                <td className="text-base-content/70">{p.analyst || '—'}</td>
                <td className="text-base-content/70">{p.client_type || '—'}</td>
                <td className="font-medium text-base-content">{p.client_name}</td>
                <td className="text-base-content/70">{p.requestor || '—'}</td>
                <td className="text-base-content/70 whitespace-nowrap">{formatDate(p.date_received)}</td>
                <td className={`whitespace-nowrap ${isOverdue(p) ? 'text-error font-semibold' : 'text-base-content/70'}`}>{formatDate(p.expected_delivery_date)}</td>
                <td className="text-base-content/70 whitespace-nowrap">{formatDate(p.date_delivered)}</td>
                <td className="text-center">
                  {p.days_to_complete != null ? (
                    <span className={`badge badge-sm ${p.days_to_complete <= 14 ? 'badge-success' : p.days_to_complete <= 30 ? 'badge-warning' : 'badge-error'} badge-outline`}>{p.days_to_complete}d</span>
                  ) : '—'}
                </td>
                <td className="text-base-content/70">{p.country || '—'}</td>
                <td className="text-base-content/70">{p.industry || '—'}</td>
                <td className="text-center text-base-content/70">{p.job_count ?? '—'}</td>
                {onEdit && (
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost btn-xs gap-1"
                      onClick={() => onEdit(p)}
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={onEdit ? 14 : 13} className="text-center py-12 text-base-content/40">No projects match your filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-base-content/50">Page {page + 1} of {totalPages} · {projects.length.toLocaleString()} projects</span>
          <div className="join">
            <button className="join-item btn btn-sm btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum = i
              if (totalPages > 7) {
                if (page < 3) pageNum = i
                else if (page > totalPages - 4) pageNum = totalPages - 7 + i
                else pageNum = page - 3 + i
              }
              return (
                <button
                  key={pageNum}
                  className={`join-item btn btn-sm ${page === pageNum ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum + 1}
                </button>
              )
            })}
            <button className="join-item btn btn-sm btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
