import React from 'react'
import type { StatusCount, OwnerCount } from '../types'
import { getStatusHex } from '../lib/data'

const DonutChart: React.FC<{ data: StatusCount[] }> = ({ data }) => {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return <div className="flex items-center justify-center h-full text-base-content/40 text-sm">No data</div>

  let cumulative = 0
  const segments = data.map(d => {
    const pct = (d.count / total) * 100
    const start = cumulative
    cumulative += pct
    return { ...d, pct, start, end: cumulative }
  })

  const gradient = segments.map(s => `${getStatusHex(s.status)} ${s.start.toFixed(1)}% ${s.end.toFixed(1)}%`).join(', ')

  return (
    <div className="flex flex-col items-center gap-4 h-full">
      <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
        <div className="rounded-full" style={{ width: 160, height: 160, background: `conic-gradient(${gradient})` }} />
        <div className="absolute rounded-full bg-base-200 flex flex-col items-center justify-center" style={{ width: 96, height: 96 }}>
          <span className="text-xl font-bold text-base-content">{total.toLocaleString()}</span>
          <span className="text-xs text-base-content/50">projects</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
        {segments.map(s => (
          <div key={s.status} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: getStatusHex(s.status) }} />
            <span className="text-xs text-base-content/70">{s.status}</span>
            <span className="text-xs font-semibold text-base-content">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const OwnerBarChart: React.FC<{ data: OwnerCount[] }> = ({ data }) => {
  if (data.length === 0) return <div className="flex items-center justify-center h-full text-base-content/40 text-sm">No data</div>
  const maxCount = Math.max(...data.map(d => d.count))
  return (
    <div className="space-y-2 overflow-y-auto max-h-52">
      {data.map(owner => (
        <div key={owner.project_owner} className="group">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-medium text-base-content/80">{owner.project_owner}</span>
            <div className="flex items-center gap-2 text-xs text-base-content/50">
              {owner.active > 0 && <span className="text-blue-500 font-medium">{owner.active} active</span>}
              <span>{owner.count} total</span>
            </div>
          </div>
          <div className="flex gap-0.5 h-4 rounded overflow-hidden bg-base-300/40">
            {owner.completed > 0 && <div className="bg-green-500/70 transition-all" style={{ width: `${(owner.completed / maxCount) * 100}%` }} />}
            {owner.active > 0 && <div className="bg-blue-500/80 transition-all" style={{ width: `${(owner.active / maxCount) * 100}%` }} />}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-4 pt-1">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-500/70" /><span className="text-xs text-base-content/50">Completed</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-500/80" /><span className="text-xs text-base-content/50">Active</span></div>
      </div>
    </div>
  )
}

export const Charts: React.FC<{ statusCounts: StatusCount[]; ownerCounts: OwnerCount[] }> = ({ statusCounts, ownerCounts }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div className="card bg-base-200 border border-base-300/50">
      <div className="card-body p-4 gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">Project Status Distribution</h3>
        <div className="flex items-center justify-center" style={{ minHeight: 220 }}><DonutChart data={statusCounts} /></div>
      </div>
    </div>
    <div className="card bg-base-200 border border-base-300/50">
      <div className="card-body p-4 gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">Workload by Owner</h3>
        <div style={{ minHeight: 220 }}><OwnerBarChart data={ownerCounts} /></div>
      </div>
    </div>
  </div>
)
