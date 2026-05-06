import React, { useState, useEffect } from 'react'
import { Settings, Plus, Trash2, Zap, AlertCircle, X } from 'lucide-react'
import {
  fetchTextPresets,
  createTextPreset,
  updateTextPreset,
  deleteTextPreset,
} from '../lib/data'
import type { TextPreset } from '../lib/data'

const MAX_PRESETS = 5

interface TextPresetsProps {
  onInsert: (content: string) => void
}

interface EditablePreset {
  id?: string
  name: string
  content: string
  sort_order: number
}

/** Strip Outlook/Word clipboard junk down to clean plain text */
function sanitizeClipboardText(raw: string): string {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b\u200c\u200d\u00ad\ufeff]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * XSS sanitizer — strips anything that could execute code when stored or
 * inserted into the rich-text editor. Applied on every save and every insert.
 *
 * Defences (layered):
 *  1. Decode common HTML entities so encoded payloads are caught in step 2
 *  2. Strip <script>, <iframe>, <object>, <embed>, <link>, <meta>, <svg> tags entirely
 *  3. Strip ALL remaining HTML tags
 *  4. Remove javascript: / vbscript: / data: URI schemes
 *  5. Remove inline event handler attributes (onerror=, onclick=, etc.)
 *  6. Remove null bytes and other dangerous control characters
 */
function sanitizeForStorage(text: string): string {
  let s = text
  // 1. Decode common HTML entities to expose encoded payloads
  s = s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/gi, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
  // 2. Strip dangerous tag blocks wholesale (including their content)
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  s = s.replace(/<object[\s\S]*?<\/object>/gi, '')
  s = s.replace(/<embed[^>]*>/gi, '')
  s = s.replace(/<link[^>]*>/gi, '')
  s = s.replace(/<meta[^>]*>/gi, '')
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, '')
  // 3. Strip all remaining HTML tags
  s = s.replace(/<[^>]*>/g, '')
  // 4. Remove dangerous URI schemes
  s = s.replace(/javascript\s*:/gi, '')
  s = s.replace(/vbscript\s*:/gi, '')
  s = s.replace(/data\s*:/gi, '')
  // 5. Remove inline event handlers (on* = ...)
  s = s.replace(/\bon\w+\s*=/gi, '')
  // 6. Remove null bytes and dangerous control chars (except \n and \t)
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  return s.trim()
}

export const TextPresets: React.FC<TextPresetsProps> = ({ onInsert }) => {
  const [presets, setPresets] = useState<TextPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editPresets, setEditPresets] = useState<EditablePreset[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    fetchTextPresets()
      .then(setPresets)
      .catch(() => setPresets([]))
      .finally(() => setLoading(false))
  }, [])

  const openModal = () => {
    setEditPresets(presets.map(p => ({ id: p.id, name: p.name, content: p.content, sort_order: p.sort_order })))
    setSaveError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setSaveError(null)
  }

  const addPreset = () => {
    if (editPresets.length >= MAX_PRESETS) return
    setEditPresets(prev => [...prev, { name: '', content: '', sort_order: prev.length }])
  }

  const removePreset = (idx: number) => {
    setEditPresets(prev => prev.filter((_, i) => i !== idx))
  }

  const updateEdit = (idx: number, field: 'name' | 'content', value: string) => {
    setEditPresets(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  /** Force plain text paste and sanitize Outlook / Word clipboard content */
  const handleContentPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, idx: number) => {
    e.preventDefault()
    const plain = e.clipboardData.getData('text/plain')
    const clean = sanitizeClipboardText(plain)
    const target = e.currentTarget
    const start = target.selectionStart ?? 0
    const end = target.selectionEnd ?? 0
    const current = editPresets[idx].content
    const next = current.slice(0, start) + clean + current.slice(end)
    updateEdit(idx, 'content', next)
    requestAnimationFrame(() => {
      target.selectionStart = start + clean.length
      target.selectionEnd = start + clean.length
    })
  }

  /** Sanitize name field pastes too (email subjects etc.) */
  const handleNamePaste = (e: React.ClipboardEvent<HTMLInputElement>, idx: number) => {
    e.preventDefault()
    const plain = e.clipboardData.getData('text/plain')
    const clean = sanitizeClipboardText(plain).replace(/\n/g, ' ')
    const target = e.currentTarget
    const start = target.selectionStart ?? 0
    const end = target.selectionEnd ?? 0
    const current = editPresets[idx].name
    const next = (current.slice(0, start) + clean + current.slice(end)).slice(0, 40)
    updateEdit(idx, 'name', next)
    requestAnimationFrame(() => {
      const pos = Math.min(start + clean.length, 40)
      target.selectionStart = pos
      target.selectionEnd = pos
    })
  }

  const handleSave = async () => {
    for (const p of editPresets) {
      if (!p.name.trim()) { setSaveError('All presets must have a name.'); return }
      if (!p.content.trim()) { setSaveError('All presets must have content.'); return }
    }
    setSaving(true)
    setSaveError(null)
    try {
      const originalIds = new Set(presets.map(p => p.id))
      const editIds = new Set(editPresets.filter(p => p.id).map(p => p.id!))

      // Delete removed presets
      for (const id of originalIds) {
        if (!editIds.has(id)) await deleteTextPreset(id)
      }

      // Sanitize, then update existing / create new
      for (let i = 0; i < editPresets.length; i++) {
        const ep = editPresets[i]
        const safeName = sanitizeForStorage(ep.name.trim())
        const safeContent = sanitizeForStorage(ep.content.trim())
        if (ep.id) {
          await updateTextPreset(ep.id, { name: safeName, content: safeContent, sort_order: i })
        } else {
          await createTextPreset(safeName, safeContent, i)
        }
      }

      const fresh = await fetchTextPresets()
      setPresets(fresh)
      closeModal()
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save presets. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return null

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {presets.length > 0 && (
          <span className="text-[11px] text-base-content/35 shrink-0 flex items-center gap-1 mr-0.5">
            <Zap size={9} className="text-primary/40" />
            Quick insert:
          </span>
        )}
        {presets.map(preset => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onInsert(sanitizeForStorage(preset.content))}
            className="btn btn-xs btn-ghost border border-base-300/70 rounded-full px-2.5 h-6 min-h-0 text-[11px] text-base-content/60 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all"
            title={`Insert: ${preset.name}`}
          >
            {preset.name}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost btn-xs btn-circle h-6 w-6 min-h-0 opacity-35 hover:opacity-75 transition-opacity ml-0.5"
          title="Manage text presets"
          onClick={openModal}
        >
          <Settings size={11} />
        </button>
        {presets.length === 0 && !loading && (
          <button
            type="button"
            className="text-[11px] text-base-content/30 hover:text-primary/60 transition-colors"
            onClick={openModal}
          >
            Add quick-insert presets…
          </button>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative bg-base-100 rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[88vh]">

            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-base-300">
              <div>
                <h3 className="text-base font-bold text-base-content flex items-center gap-2">
                  <Zap size={15} className="text-primary" />
                  Manage Quick Presets
                </h3>
                <p className="text-xs text-base-content/40 mt-0.5">
                  Up to {MAX_PRESETS} presets · Click a pill to instantly insert text into your note
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle -mt-0.5 -mr-1"
                onClick={closeModal}
                disabled={saving}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {editPresets.length === 0 && (
                <div className="text-center py-10">
                  <Zap size={30} className="mx-auto text-base-content/10 mb-2" />
                  <p className="text-sm text-base-content/40 font-medium">No presets yet</p>
                  <p className="text-xs text-base-content/25 mt-1">
                    Add up to {MAX_PRESETS} reusable text snippets for fast note entry
                  </p>
                </div>
              )}

              {editPresets.map((ep, idx) => (
                <div key={idx} className="border border-base-300 rounded-xl p-3 bg-base-50 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-base-content/25 w-4 shrink-0 text-center tabular-nums">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      className="input input-bordered input-sm flex-1 text-sm"
                      placeholder="Preset name (e.g. Level Guide)"
                      value={ep.name}
                      onChange={e => updateEdit(idx, 'name', e.target.value)}
                      onPaste={e => handleNamePaste(e, idx)}
                      maxLength={40}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs btn-circle text-error/40 hover:text-error hover:bg-error/10 shrink-0 transition-colors"
                      onClick={() => removePreset(idx)}
                      title="Remove preset"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <textarea
                    className="textarea textarea-bordered textarea-sm w-full text-xs resize-none font-mono leading-relaxed"
                    rows={5}
                    placeholder="Text to insert when the preset pill is clicked…"
                    value={ep.content}
                    onChange={e => updateEdit(idx, 'content', e.target.value)}
                    onPaste={e => handleContentPaste(e, idx)}
                  />
                  <p className="text-[10px] text-base-content/30 pl-6">
                    Each line becomes a paragraph in the editor · Paste from anywhere — formatting is stripped automatically
                  </p>
                </div>
              ))}

              {editPresets.length < MAX_PRESETS && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm w-full gap-1.5 border-dashed border-base-300 text-base-content/35 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors"
                  onClick={addPreset}
                >
                  <Plus size={13} />
                  Add Preset
                  <span className="text-[10px] opacity-50 ml-1">
                    ({editPresets.length}/{MAX_PRESETS})
                  </span>
                </button>
              )}

              {editPresets.length >= MAX_PRESETS && (
                <p className="text-center text-xs text-base-content/30 py-1">
                  Maximum of {MAX_PRESETS} presets reached
                </p>
              )}

              {saveError && (
                <div className="flex items-center gap-2 p-3 bg-error/10 rounded-xl text-error text-sm border border-error/20">
                  <AlertCircle size={14} className="shrink-0" />
                  {saveError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 p-4 border-t border-base-300 bg-base-50 rounded-b-2xl">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={closeModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn btn-primary btn-sm gap-1.5 ${saving ? 'loading' : ''}`}
                onClick={handleSave}
                disabled={saving}
              >
                {!saving && <Settings size={13} />}
                Save Presets
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
