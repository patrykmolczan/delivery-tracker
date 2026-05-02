import { useState, useRef, useEffect } from 'react'
import { Search, X, SlidersHorizontal, ChevronDown, Check, Filter } from 'lucide-react'
import type { FilterState } from '../types'

interface FilterBarProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  options: {
    owners: string[]
    analysts: string[]
    clientTypes: string[]
    industries: string[]
    countries: string[]
    statuses: string[]
  }
  resultCount: number
  totalCount: number
}

interface MultiSelectProps {
  label: string
  options: string[]
  selected: string[]
  onChange: (values: string[]) => void
}

function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options

  const allSelected = filtered.length > 0 && filtered.every(o => selected.includes(o))
  const someSelected = filtered.some(o => selected.includes(o)) && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      onChange(selected.filter(s => !filtered.includes(s)))
    } else {
      onChange([...new Set([...selected, ...filtered])])
    }
  }

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(s => s !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const displayLabel =
    selected.length === 0
      ? `All ${label}s`
      : selected.length === 1
      ? selected[0]
      : `${selected.length} ${label}s`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors w-full
          ${selected.length > 0
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-base-100 border-base-300 text-base-content/70 hover:border-base-content/30'
          }`}
      >
        <span className="truncate flex-1 text-left">{displayLabel}</span>
        {selected.length > 0 && (
          <span
            className="w-4 h-4 rounded-full bg-primary text-primary-content text-[10px] font-bold flex items-center justify-center shrink-0 cursor-pointer hover:bg-error transition-colors"
            onClick={e => { e.stopPropagation(); onChange([]) }}
            title="Clear"
          >
            ×
          </span>
        )}
        <ChevronDown size={10} className={`shrink-0 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-base-100 border border-base-300 rounded-xl shadow-xl min-w-[190px] max-w-[260px] overflow-hidden">
          {options.length > 8 && (
            <div className="p-2 border-b border-base-300">
              <input
                type="text"
                className="input input-xs input-bordered w-full"
                placeholder={`Search…`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {filtered.length > 1 && (
            <div
              className="flex items-center gap-2 px-3 py-2 hover:bg-base-200 cursor-pointer border-b border-base-300/50"
              onClick={toggleAll}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                allSelected
                  ? 'bg-primary border-primary'
                  : someSelected
                  ? 'bg-primary/30 border-primary/40'
                  : 'border-base-300'
              }`}>
                {allSelected && <Check size={10} className="text-primary-content" />}
                {someSelected && <span className="w-2 h-0.5 bg-primary rounded" />}
              </div>
              <span className="text-xs font-medium text-base-content/60">Select all</span>
            </div>
          )}

          <div className="overflow-y-auto max-h-56 py-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-base-content/40 px-3 py-2">No matches</p>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-base-200 cursor-pointer"
                  onClick={() => toggle(opt)}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    selected.includes(opt) ? 'bg-primary border-primary' : 'border-base-300'
                  }`}>
                    {selected.includes(opt) && <Check size={10} className="text-primary-content" />}
                  </div>
                  <span className="text-xs text-base-content truncate">{opt}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function FilterBar({ filters, onChange, options, resultCount, totalCount }: FilterBarProps) {
  const [expanded, setExpanded] = useState(false)

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

  const clearAll = () =>
    onChange({ search: '', status: [], owner: [], analyst: [], clientType: [], industry: [], country: [], dateFrom: '', dateTo: '' })

  const set = (key: keyof FilterState, value: FilterState[keyof FilterState]) =>
    onChange({ ...filters, [key]: value })

  return (
    <div className="space-y-3">
      {/* Search + expand button */}
      <div className="flex items-center gap-3">
        <label className="input input-bordered flex items-center gap-2 flex-1 bg-base-200 border-base-300">
          <Search className="h-[1em] opacity-50" />
          <input
            type="search"
            className="grow"
            placeholder="Search projects, clients, owners, analysts..."
            value={filters.search}
            onChange={e => set('search', e.target.value)}
          />
          {filters.search && (
            <button onClick={() => set('search', '')} className="btn btn-ghost btn-xs btn-circle">
              <X size={14} />
            </button>
          )}
        </label>

        <button
          className={`btn btn-sm gap-2 ${expanded ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
          onClick={() => setExpanded(v => !v)}
        >
          <SlidersHorizontal size={14} />
          Filters
          {activeFilterCount > 0 && (
            <span className="badge badge-secondary badge-sm">{activeFilterCount}</span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button className="btn btn-ghost btn-sm text-error gap-1" onClick={clearAll}>
            <X size={14} /> Clear all
          </button>
        )}
      </div>

      {/* Multi-select panel */}
      {expanded && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 p-3 bg-base-200 rounded-xl border border-base-300/50">
          <MultiSelect label="Status"      options={options.statuses}    selected={filters.status}     onChange={v => set('status', v)} />
          <MultiSelect label="Owner"       options={options.owners}      selected={filters.owner}      onChange={v => set('owner', v)} />
          <MultiSelect label="Analyst"     options={options.analysts}    selected={filters.analyst}    onChange={v => set('analyst', v)} />
          <MultiSelect label="Client Type" options={options.clientTypes} selected={filters.clientType} onChange={v => set('clientType', v)} />
          <MultiSelect label="Industry"    options={options.industries}  selected={filters.industry}   onChange={v => set('industry', v)} />
          <MultiSelect label="Country"     options={options.countries}   selected={filters.country}    onChange={v => set('country', v)} />
          <input
            type="date"
            className="input input-bordered input-sm bg-base-100 col-span-1"
            title="Date received from"
            value={filters.dateFrom}
            onChange={e => set('dateFrom', e.target.value)}
          />
          <input
            type="date"
            className="input input-bordered input-sm bg-base-100 col-span-1"
            title="Date received to"
            value={filters.dateTo}
            onChange={e => set('dateTo', e.target.value)}
          />
        </div>
      )}

      {/* Result count */}
      <div className="flex items-center gap-2 text-xs text-base-content/50">
        <Filter size={12} />
        <span>
          Showing <strong className="text-base-content">{resultCount.toLocaleString()}</strong> of {totalCount.toLocaleString()} projects
          {activeFilterCount > 0 && (
            <span className="text-primary ml-1">({activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active)</span>
          )}
        </span>
      </div>
    </div>
  )
}
