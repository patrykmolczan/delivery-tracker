import React from 'react'
import { Search, X, Filter, SlidersHorizontal } from 'lucide-react'
import type { FilterState } from '../types'

interface FilterBarProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  options: { owners: string[]; analysts: string[]; clientTypes: string[]; industries: string[]; countries: string[]; statuses: string[] }
  resultCount: number
  totalCount: number
}

export const FilterBar: React.FC<FilterBarProps> = ({ filters, onChange, options, resultCount, totalCount }) => {
  const [expanded, setExpanded] = React.useState(false)
  const activeFilterCount = [filters.status, filters.owner, filters.analyst, filters.clientType, filters.industry, filters.country, filters.dateFrom, filters.dateTo].filter(Boolean).length
  const clearAll = () => onChange({ search: '', status: '', owner: '', analyst: '', clientType: '', industry: '', country: '', dateFrom: '', dateTo: '' })
  const set = (key: keyof FilterState, value: string) => onChange({ ...filters, [key]: value })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="input input-bordered flex items-center gap-2 flex-1 bg-base-200 border-base-300">
          <Search className="h-[1em] opacity-50" />
          <input type="search" className="grow" placeholder="Search projects, clients, owners, analysts..." value={filters.search} onChange={e => set('search', e.target.value)} />
          {filters.search && <button onClick={() => set('search', '')} className="btn btn-ghost btn-xs btn-circle"><X size={14} /></button>}
        </label>
        <button className={`btn btn-sm gap-2 ${expanded ? 'btn-primary' : 'btn-ghost border-base-300'}`} onClick={() => setExpanded(!expanded)}>
          <SlidersHorizontal size={14} />Filters
          {activeFilterCount > 0 && <span className="badge badge-secondary badge-sm">{activeFilterCount}</span>}
        </button>
        {activeFilterCount > 0 && <button className="btn btn-ghost btn-sm text-error" onClick={clearAll}><X size={14} /> Clear</button>}
      </div>
      {expanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 p-3 bg-base-200 rounded-xl border border-base-300/50">
          <select className="select select-bordered select-sm bg-base-100" value={filters.status} onChange={e => set('status', e.target.value)}>
            <option value="">All Statuses</option>
            {options.statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select select-bordered select-sm bg-base-100" value={filters.owner} onChange={e => set('owner', e.target.value)}>
            <option value="">All Owners</option>
            {options.owners.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select select-bordered select-sm bg-base-100" value={filters.analyst} onChange={e => set('analyst', e.target.value)}>
            <option value="">All Analysts</option>
            {options.analysts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select select-bordered select-sm bg-base-100" value={filters.clientType} onChange={e => set('clientType', e.target.value)}>
            <option value="">All Client Types</option>
            {options.clientTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select select-bordered select-sm bg-base-100" value={filters.industry} onChange={e => set('industry', e.target.value)}>
            <option value="">All Industries</option>
            {options.industries.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select select-bordered select-sm bg-base-100" value={filters.country} onChange={e => set('country', e.target.value)}>
            <option value="">All Countries</option>
            {options.countries.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" className="input input-bordered input-sm bg-base-100" placeholder="From" value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)} />
          <input type="date" className="input input-bordered input-sm bg-base-100" placeholder="To" value={filters.dateTo} onChange={e => set('dateTo', e.target.value)} />
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-base-content/50">
        <Filter size={12} />
        <span>Showing <strong className="text-base-content">{resultCount.toLocaleString()}</strong> of {totalCount.toLocaleString()} projects</span>
      </div>
    </div>
  )
}
