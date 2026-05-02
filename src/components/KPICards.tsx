import React from 'react'
import { Activity, CheckCircle, Clock, AlertTriangle, XCircle, PauseCircle, Briefcase, TrendingUp, Calendar } from 'lucide-react'
import type { KPIData } from '../types'

interface CardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  accent?: string
}

const Card: React.FC<CardProps> = ({ title, value, subtitle, icon, accent }) => (
  <div className="card bg-base-200 shadow-sm hover:shadow-md transition-all duration-200 border border-base-300/50">
    <div className="card-body p-4 gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-base-content/50">{title}</span>
        <div className={`p-1.5 rounded-lg ${accent || 'bg-primary/10'}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight text-base-content">{value}</div>
      {subtitle && <span className="text-xs text-base-content/50">{subtitle}</span>}
    </div>
  </div>
)

export const KPICards: React.FC<{ kpis: KPIData }> = ({ kpis }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-9 gap-3">
    <Card title="Total" value={kpis.total.toLocaleString()} subtitle="All projects" icon={<Briefcase size={16} className="text-primary" />} accent="bg-primary/10" />
    <Card title="Active" value={kpis.active} subtitle="In progress" icon={<Activity size={16} className="text-info" />} accent="bg-info/10" />
    <Card title="Completed" value={kpis.completed.toLocaleString()} subtitle={`${kpis.completionRate}% rate`} icon={<CheckCircle size={16} className="text-success" />} accent="bg-success/10" />
    <Card title="On Hold" value={kpis.onHold} subtitle="Paused" icon={<PauseCircle size={16} className="text-warning" />} accent="bg-warning/10" />
    <Card title="Overdue" value={kpis.overdue} subtitle="Past due date" icon={<AlertTriangle size={16} className="text-error" />} accent="bg-error/10" />
    <Card title="Cancelled" value={kpis.cancelled} subtitle="Stopped" icon={<XCircle size={16} className="text-error/60" />} accent="bg-error/5" />
    <Card title="Avg Days" value={kpis.avgDaysToComplete} subtitle="To complete" icon={<Clock size={16} className="text-secondary" />} accent="bg-secondary/10" />
    <Card title="Total Jobs" value={kpis.totalJobs.toLocaleString()} subtitle="Across all" icon={<TrendingUp size={16} className="text-accent" />} accent="bg-accent/10" />
    <Card title="This Month" value={kpis.deliveredThisMonth} subtitle="Delivered" icon={<Calendar size={16} className="text-teal-500" />} accent="bg-teal-500/10" />
  </div>
)
