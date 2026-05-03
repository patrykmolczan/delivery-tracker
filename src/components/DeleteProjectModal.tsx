import React, { useState } from 'react'
import { Trash2, AlertTriangle, X } from 'lucide-react'

interface Props {
  projectName: string
  onConfirm: () => Promise<void>
  onClose: () => void
}

export const DeleteProjectModal: React.FC<Props> = ({ projectName, onConfirm, onClose }) => {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = confirmText.trim() === (projectName || '').trim()

  const handleDelete = async () => {
    if (!matches) return
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err: any) {
      setError(err.message || 'Delete failed')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!deleting ? onClose : undefined}
      />
      <div className="relative bg-base-100 rounded-2xl shadow-2xl w-full max-w-md border border-base-300 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-error/15 to-error/5 border-b border-error/20 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-error/15 border border-error/20 flex items-center justify-center shrink-0">
              <Trash2 size={18} className="text-error" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg leading-tight">Delete Project</h2>
              <p className="text-xs text-base-content/50 mt-0.5">This action is permanent and cannot be undone</p>
            </div>
            <button className="btn btn-ghost btn-sm btn-circle shrink-0" onClick={onClose} disabled={deleting}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-warning/10 rounded-xl border border-warning/20">
            <AlertTriangle size={15} className="text-warning mt-0.5 shrink-0" />
            <p className="text-sm text-base-content/75 leading-relaxed">
              All project data will be permanently deleted — including files, history,
              delivery records, feedback threads, and settings.
            </p>
          </div>

          <div className="p-3 bg-base-200 rounded-xl border border-base-300 text-center">
            <p className="text-xs text-base-content/40 uppercase tracking-wider mb-1">Project</p>
            <p className="font-semibold text-base-content break-words">{projectName}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-base-content/60 block mb-1.5">
              Type <span className="font-bold text-base-content/80 italic">{projectName}</span> to confirm:
            </label>
            <input
              type="text"
              className={`input input-bordered w-full text-sm transition-colors ${matches && confirmText ? 'border-error' : ''}`}
              placeholder="Type project name here…"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              autoFocus
              disabled={deleting}
              onKeyDown={e => e.key === 'Enter' && matches && handleDelete()}
            />
          </div>

          {error && (
            <div className="p-2.5 bg-error/10 rounded-lg text-xs text-error border border-error/20">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 bg-base-50 border-t border-base-300 justify-end">
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button
            className={`btn btn-error btn-sm gap-2 ${deleting ? 'loading' : ''}`}
            onClick={handleDelete}
            disabled={!matches || deleting}
          >
            {!deleting && <Trash2 size={14} />}
            {deleting ? 'Deleting…' : 'Delete Project'}
          </button>
        </div>
      </div>
    </div>
  )
}
