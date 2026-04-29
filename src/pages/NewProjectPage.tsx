import React, { useState, useEffect } from 'react'
import { Save, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { fetchLookups, createProject, updateProject } from '../lib/data'
import type { LookupItem, Project, ProjectFormData } from '../types'

interface Props {
  editProject?: Project | null
  onSaved: (project: Project) => void
  onCancel: () => void
}

const EMPTY_FORM: ProjectFormData = {
  project_owner: '',
  analyst: '',
  client_type_id: null,
  client_name: '',
  requestor: '',
  date_received: new Date().toISOString().slice(0, 10),
  expected_delivery_date: '',
  date_delivered: '',
  project_summary: '',
  job_count: '',
  status_id: null,
  country_id: null,
  industry_id: null,
}

// ⚠️ IMPORTANT: Field must be defined OUTSIDE the parent component.
// If defined inside, React treats it as a new component type on every render,
// causing inputs to unmount/remount and lose focus after each keystroke.
interface FieldProps {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}

const Field: React.FC<FieldProps> = ({ label, required, error, children }) => (
  <div className="form-control gap-1">
    <label className="label py-0">
      <span className="label-text font-medium text-sm">
        {label}{required && <span className="text-error ml-0.5">*</span>}
      </span>
    </label>
    {children}
    {error && <span className="text-error text-xs">{error}</span>}
  </div>
)

export const NewProjectPage: React.FC<Props> = ({ editProject, onSaved, onCancel }) => {
  const { user } = useAuth()
  const [form, setForm] = useState<ProjectFormData>(EMPTY_FORM)
  const [lookups, setLookups] = useState<{ statuses: LookupItem[]; clientTypes: LookupItem[]; industries: LookupItem[]; countries: LookupItem[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fetchLookups()
      .then(setLookups)
      .catch(err => {
        setError('Failed to load form options: ' + (err.message || 'Unknown error'))
        setLookups({ statuses: [], clientTypes: [], industries: [], countries: [] })
      })
  }, [])

  useEffect(() => {
    if (editProject && lookups) {
      setForm({
        project_owner: editProject.project_owner || '',
        analyst: editProject.analyst || '',
        client_type_id: editProject.client_type_id ?? null,
        client_name: editProject.client_name || '',
        requestor: editProject.requestor || '',
        date_received: editProject.date_received || '',
        expected_delivery_date: editProject.expected_delivery_date || '',
        date_delivered: editProject.date_delivered || '',
        project_summary: editProject.project_summary || '',
        job_count: editProject.job_count?.toString() || '',
        status_id: editProject.status_id ?? null,
        country_id: editProject.country_id ?? null,
        industry_id: editProject.industry_id ?? null,
      })
    }
  }, [editProject, lookups])

  const set = (field: keyof ProjectFormData, value: any) => {
    setForm(f => ({ ...f, [field]: value }))
    setTouched(t => ({ ...t, [field]: true }))
  }

  const errors: Record<string, string> = {}
  if (touched.project_owner && !form.project_owner) errors.project_owner = 'Required'
  if (touched.client_name && !form.client_name) errors.client_name = 'Required'
  if (touched.date_received && !form.date_received) errors.date_received = 'Required'
  if (touched.status_id && !form.status_id) errors.status_id = 'Required'

  const isValid = form.project_owner && form.client_name && form.date_received && form.status_id

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid || !user) return
    setSaving(true)
    setError(null)
    try {
      if (editProject) {
        await updateProject(editProject.id, form)
        setSuccess(true)
        setTimeout(() => onSaved({ ...editProject, ...form } as any), 800)
      } else {
        const created = await createProject(form, user.id)
        setSuccess(true)
        setTimeout(() => onSaved(created), 800)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save project')
    } finally {
      setSaving(false)
    }
  }

  if (!lookups && !error) return (
    <div className="flex items-center justify-center h-64">
      <span className="loading loading-spinner loading-md text-primary"></span>
    </div>
  )
  if (!lookups && error) return (
    <div className="flex items-center justify-center h-64">
      <div className="alert alert-error max-w-md">
        <span>{error}</span>
      </div>
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-base-content">
            {editProject ? 'Edit Project' : 'New Project'}
          </h1>
          <p className="text-sm text-base-content/50 mt-0.5">
            {editProject ? `Editing: ${editProject.client_name}` : 'Create a new delivery tracking entry'}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={onCancel}>
          <X size={14} /> Cancel
        </button>
      </div>

      {/* Success Banner */}
      {success && (
        <div className="alert alert-success mb-4 animate-pulse">
          <CheckCircle2 size={18} />
          <span>Project {editProject ? 'updated' : 'created'} successfully!</span>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="alert alert-error mb-4">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="card bg-base-200 border border-base-300">
          <div className="card-body gap-6">

            {/* Section: People */}
            <div>
              <h3 className="text-sm font-semibold text-base-content/60 uppercase tracking-wider mb-3">
                People
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Project Owner" required error={errors.project_owner}>
                  <input
                    className={`input input-bordered w-full ${errors.project_owner ? 'input-error' : ''}`}
                    value={form.project_owner}
                    onChange={e => set('project_owner', e.target.value)}
                    onBlur={() => setTouched(t => ({ ...t, project_owner: true }))}
                    placeholder="e.g. Jane Smith"
                  />
                </Field>
                <Field label="Analyst">
                  <input
                    className="input input-bordered w-full"
                    value={form.analyst}
                    onChange={e => set('analyst', e.target.value)}
                    placeholder="e.g. John Doe"
                  />
                </Field>
                <Field label="Requestor">
                  <input
                    className="input input-bordered w-full"
                    value={form.requestor}
                    onChange={e => set('requestor', e.target.value)}
                    placeholder="e.g. HR Manager"
                  />
                </Field>
              </div>
            </div>

            {/* Section: Client */}
            <div>
              <h3 className="text-sm font-semibold text-base-content/60 uppercase tracking-wider mb-3">
                Client
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Client Name" required error={errors.client_name}>
                  <input
                    className={`input input-bordered w-full ${errors.client_name ? 'input-error' : ''}`}
                    value={form.client_name}
                    onChange={e => set('client_name', e.target.value)}
                    onBlur={() => setTouched(t => ({ ...t, client_name: true }))}
                    placeholder="e.g. Acme Corp"
                  />
                </Field>
                <Field label="Client Type">
                  <select
                    className="select select-bordered w-full"
                    value={form.client_type_id ?? ''}
                    onChange={e => set('client_type_id', e.target.value ? parseInt(e.target.value) : null)}
                  >
                    <option value="">— Select client type —</option>
                    {lookups!.clientTypes.map(ct => (
                      <option key={ct.id} value={ct.id}>{ct.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Country">
                  <select
                    className="select select-bordered w-full"
                    value={form.country_id ?? ''}
                    onChange={e => set('country_id', e.target.value ? parseInt(e.target.value) : null)}
                  >
                    <option value="">— Select country —</option>
                    {lookups!.countries.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Industry">
                  <select
                    className="select select-bordered w-full"
                    value={form.industry_id ?? ''}
                    onChange={e => set('industry_id', e.target.value ? parseInt(e.target.value) : null)}
                  >
                    <option value="">— Select industry —</option>
                    {lookups!.industries.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            {/* Section: Project Details */}
            <div>
              <h3 className="text-sm font-semibold text-base-content/60 uppercase tracking-wider mb-3">
                Project Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Status" required error={errors.status_id}>
                  <select
                    className={`select select-bordered w-full ${errors.status_id ? 'select-error' : ''}`}
                    value={form.status_id ?? ''}
                    onChange={e => set('status_id', e.target.value ? parseInt(e.target.value) : null)}
                    onBlur={() => setTouched(t => ({ ...t, status_id: true }))}
                  >
                    <option value="">— Select status —</option>
                    {lookups!.statuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Job Count">
                  <input
                    type="number"
                    className="input input-bordered w-full"
                    value={form.job_count}
                    onChange={e => set('job_count', e.target.value)}
                    placeholder="e.g. 150"
                    min="0"
                  />
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Project Summary">
                  <textarea
                    className="textarea textarea-bordered w-full h-24 resize-none"
                    value={form.project_summary}
                    onChange={e => set('project_summary', e.target.value)}
                    placeholder="Describe the project scope, requirements, or notes..."
                  />
                </Field>
              </div>
            </div>

            {/* Section: Dates */}
            <div>
              <h3 className="text-sm font-semibold text-base-content/60 uppercase tracking-wider mb-3">
                Dates
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Date Received" required error={errors.date_received}>
                  <input
                    type="date"
                    className={`input input-bordered w-full ${errors.date_received ? 'input-error' : ''}`}
                    value={form.date_received}
                    onChange={e => set('date_received', e.target.value)}
                    onBlur={() => setTouched(t => ({ ...t, date_received: true }))}
                  />
                </Field>
                <Field label="Expected Delivery">
                  <input
                    type="date"
                    className="input input-bordered w-full"
                    value={form.expected_delivery_date}
                    onChange={e => set('expected_delivery_date', e.target.value)}
                  />
                </Field>
                <Field label="Date Delivered">
                  <input
                    type="date"
                    className="input input-bordered w-full"
                    value={form.date_delivered}
                    onChange={e => set('date_delivered', e.target.value)}
                  />
                </Field>
              </div>
            </div>

          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            type="submit"
            className={`btn btn-primary gap-2 ${saving ? 'loading' : ''}`}
            disabled={!isValid || saving || success}
          >
            {!saving && <Save size={16} />}
            {saving ? 'Saving…' : editProject ? 'Update Project' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  )
}
