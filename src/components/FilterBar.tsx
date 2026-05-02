import React from 'react'
import { Search, X, Filter, SlidersHorizontal, ChevronDown } from 'lucide-react'
import type { FilterState } from '../types'

interface FilterBarProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  options: { owners: string[]; analysts: string[]; clientTypes: string[]; industries: string[]; countries: string[]; statuses: string[] }
  resultCount: number
  totalCount: number
}

interface MultiSelectProps {
  label: string
  value: string[]
  options: string[]
  onChange: (val: string[]) => void
}

const MultiSelect: React.FC<MultiSelectProps> = ({ label, value, options, onChange }) => {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  const btnLabel =
    value.length === 0 ? `All ${label}` :
    value.length === 1 ? value[0] :
    `${value.length} ${label}`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full h-8 px-2.5 text-xs border rounded-lg bg-base-100 flex items-center justify-between gap-1 transition-colors
          ${value.length > 0 ? 'border-primary/60 text-base-content' : 'border-base-300 text-base-content/60'}
          hover:border-base-content/40`}
      >
        <span className="truncate">{btnLabel}</span>
        <ChevronDown size={11} className="flex-shrink-0 opacity-50" />
      </button>
      {open && options.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg min-w-full max-h-52 overflow-y-auto">
          {options.map(opt => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-base-200 cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-xs checkbox-primary"
                checked={value.includes(opt)}
                onChange={() => toggle(opt)}
              />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export const FilterBar: React.FC<FilterBarProps> = ({ filters, onChange, options, resultCount, totalCount }) => {
  const [expanded, setExpanded] = React.useState(false)

  const activeFilterCount = [
    filters.status.length > 0,
    filters.owner.length > 0,
    filters.analyst.length > 0,
    filters.clientType.length > 0,
    filters.industry.length > 0,
    filters.country.length > 0,
    !!filters.dateFrom,
    !!filters.dateTo,
  ].filter(Boolean).length

  const clearAll = () => onChange({
    search: '',
    status: [],
    owner: [],
    analyst: [],
    clientType: [],
    industry: [],
    country: [],
    dateFrom: '',
    dateTo: '',
  })

  const setStr = (key: 'search' | 'dateFrom' | 'dateTo', value: string) =>
    onChange({ ...filters, [key]: value })

  const setArr = (key: 'status' | 'owner' | 'analyst' | 'clientType' | 'industry' | 'country', value: string[]) =>
    onChange({ ...filters, [key]: value })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="input input-bordered flex items-center gap-2 flex-1 bg-base-200 border-base-300">
          <Search className="h-[1em] opacity-50" />
          <input
            type="search"
            className="grow"
            placeholder="Search projects, clients, owners, analysts..."
            value={filters.search}
            onChange={e => setStr('search', e.target.value)}
          />
          {filters.search && (
            <button onClick={() => setStr('search', '')} className="btn btn-ghost btn-xs btn-circle">
              <X size={14} />
            </button>
          )}
        </label>
        <button
          className={`btn btn-sm gap-2 ${expanded ? 'btn-primary' : 'btn-ghost border-base-300'}`}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={14} />Filters
          {activeFilterCount > 0 && (
            <span className="badge badge-secondary badge-sm">{activeFilterCount}</span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button className="btn btn-ghost btn-sm text-error" onClick={clearAll}>
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 p-3 bg-base-200 rounded-xl border border-base-300/50">
          <MultiSelect label="Statuses"     value={filters.status}     options={options.statuses}     onChange={v => setArr('status', v)} />
          <MultiSelect label="Owners"       value={filters.owner}      options={options.owners}       onChange={v => setArr('owner', v)} />
          <MultiSelect label="Analysts"     value={filters.analyst}    options={options.analysts}     onChange={v => setArr('analyst', v)} />
          <MultiSelect label="Client Types" value={filters.clientType} options={options.clientTypes}  onChange={v => setArr('clientType', v)} />
          <MultiSelect label="Industries"   value={filters.industry}   options={options.industries}   onChange={v => setArr('industry', v)} />
          <MultiSelect label="Countries"    value={filters.country}    options={options.countries}    onChange={v => setArr('country', v)} />
          <input
            type="date"
            className="input input-bordered input-sm bg-base-100"
            placeholder="From"
            value={filters.dateFrom}
            onChange={e => setStr('dateFrom', e.target.value)}
          />
          <input
            type="date"
            className="input input-bordered input-sm bg-base-100"
            placeholder="To"
            value={filters.dateTo}
            onChange={e => setStr('dateTo', e.target.value)}
          />
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-base-content/50">
        <Filter size={12} />
        <span>Showing <strong className="text-base-content">{resultCount.toLocaleString()}</strong> of {totalCount.toLocaleString()} projects</span>
      </div>
    </div>
  )
}
