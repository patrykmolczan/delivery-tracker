import React, { useState, useEffect } from 'react'
import { Sparkles, Loader2, Download, X } from 'lucide-react'
import {
  findRowsMissingDescriptions,
  generateDescriptions,
  buildExcelWithDescriptions,
  type JobRowInfo,
} from '../lib/descriptionGenerator'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** The original Excel file the user uploaded — null until a file is parsed */
  originalFile: File | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExportWithDescriptions({ originalFile }: Props) {
  const [missingRows, setMissingRows] = useState<JobRowInfo[]>([])
  const [phase, setPhase] = useState<
    'idle' | 'confirming' | 'generating' | 'building' | 'done' | 'error'
  >('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Re-scan for missing descriptions whenever the uploaded file changes
  useEffect(() => {
    if (!originalFile) {
      setMissingRows([])
      setPhase('idle')
      return
    }
    findRowsMissingDescriptions(originalFile)
      .then(rows => setMissingRows(rows))
      .catch(() => setMissingRows([]))
  }, [originalFile])

  // Nothing to show if there are no rows missing descriptions
  if (!originalFile || missingRows.length === 0) return null

  const uniqueTitleCount = new Set(missingRows.map(r => r.jobTitle)).size
  const isWorking = phase === 'generating' || phase === 'building'

  // ── Generate + download ────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setPhase('generating')
    setErrorMsg(null)
    try {
      const titles = [...new Set(missingRows.map(r => r.jobTitle))]
      const titleToDesc = await generateDescriptions(titles)

      setPhase('building')
      const blob = await buildExcelWithDescriptions(originalFile, titleToDesc)

      // Trigger browser download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const baseName = originalFile.name.replace(/\.[^.]+$/, '')
      a.download = `${baseName}_with_descriptions.xlsx`
      a.click()
      URL.revokeObjectURL(url)

      setPhase('done')
      setTimeout(() => setPhase('idle'), 4000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed'
      setErrorMsg(msg)
      setPhase('error')
      setTimeout(() => { setPhase('idle'); setErrorMsg(null) }, 6000)
    }
  }

  // ── Render: confirmation inline banner ─────────────────────────────────────

  if (phase === 'confirming') {
    return (
      <div className="flex items-center gap-2 flex-wrap bg-secondary/5 border border-secondary/20 rounded-lg px-3 py-1.5">
        <Sparkles className="w-3.5 h-3.5 text-secondary shrink-0" />
        <span className="text-xs text-base-content/70">
          Generate AI descriptions for{' '}
          <span className="font-semibold text-base-content">{missingRows.length}</span> row
          {missingRows.length !== 1 ? 's' : ''}{' '}
          ({uniqueTitleCount} unique title{uniqueTitleCount !== 1 ? 's' : ''}) and download
          a new Excel file?
        </span>
        <button
          type="button"
          onClick={handleGenerate}
          className="btn btn-xs btn-secondary gap-1"
        >
          <Download className="w-3 h-3" /> Generate &amp; download
        </button>
        <button
          type="button"
          onClick={() => setPhase('idle')}
          className="btn btn-xs btn-ghost text-base-content/50"
          aria-label="Cancel"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  // ── Render: working state ──────────────────────────────────────────────────

  if (isWorking) {
    return (
      <button type="button" disabled className="btn btn-xs btn-ghost gap-1 text-secondary/70 cursor-wait">
        <Loader2 className="w-3 h-3 animate-spin" />
        {phase === 'generating' ? 'Generating descriptions…' : 'Building Excel…'}
      </button>
    )
  }

  // ── Render: done ───────────────────────────────────────────────────────────

  if (phase === 'done') {
    return (
      <span className="flex items-center gap-1 text-xs text-success font-medium px-1">
        <Download className="w-3 h-3" /> Downloaded!
      </span>
    )
  }

  // ── Render: error ──────────────────────────────────────────────────────────

  if (phase === 'error') {
    return (
      <span className="flex items-center gap-1 text-xs text-error px-1 max-w-[240px] truncate" title={errorMsg ?? ''}>
        ⚠ {errorMsg ?? 'Error generating descriptions'}
      </span>
    )
  }

  // ── Render: idle button ────────────────────────────────────────────────────

  return (
    <button
      type="button"
      onClick={() => setPhase('confirming')}
      className="btn btn-xs btn-ghost gap-1 text-secondary hover:text-secondary/80"
    >
      <Sparkles className="w-3 h-3" />
      Fill {missingRows.length} missing description{missingRows.length !== 1 ? 's' : ''}
    </button>
  )
}
