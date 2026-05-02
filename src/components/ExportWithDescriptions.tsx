import { useState, useEffect, useCallback } from 'react'
import { Sparkles, Download, Loader2, X } from 'lucide-react'
import { findRowsMissingDescriptions, generateDescriptions, buildExcelWithDescriptions } from '../lib/descriptionGenerator'

interface Props {
  originalFile: File | null
}

export default function ExportWithDescriptions({ originalFile }: Props) {
  const [missingRows, setMissingRows] = useState<{ rowIndex: number; jobTitle: string }[]>([])
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!originalFile) { setMissingRows([]); return }
    findRowsMissingDescriptions(originalFile).then(setMissingRows)
  }, [originalFile])

  const uniqueTitles = [...new Set(missingRows.map(r => r.jobTitle).filter(Boolean))]

  const handleGenerate = useCallback(async () => {
    if (!originalFile) return
    setStep('loading')
    try {
      const descriptions = await generateDescriptions(uniqueTitles)
      const blob = await buildExcelWithDescriptions(originalFile, descriptions)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const baseName = originalFile.name.replace(/\.[^.]+$/, '')
      a.download = `${baseName}_with_descriptions.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setStep('done')
      setTimeout(() => setStep('idle'), 3000)
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error')
      setStep('error')
    }
  }, [originalFile, uniqueTitles])

  if (!originalFile || missingRows.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      {step === 'idle' && (
        <button
          type="button"
          onClick={() => setStep('confirm')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Fill {missingRows.length} missing description{missingRows.length !== 1 ? 's' : ''}
        </button>
      )}

      {step === 'confirm' && (
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-violet-50 border border-violet-200 text-xs">
          <span className="text-violet-900">
            Generate AI descriptions for <strong>{missingRows.length} row{missingRows.length !== 1 ? 's' : ''}</strong> ({uniqueTitles.length} unique title{uniqueTitles.length !== 1 ? 's' : ''}) and download a filled Excel?
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleGenerate}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
            >
              <Download className="w-3 h-3" /> Generate &amp; download
            </button>
            <button
              type="button"
              onClick={() => setStep('idle')}
              className="flex items-center gap-1 px-2 py-1 rounded bg-base-200 hover:bg-base-300 text-base-content/70 transition-colors"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'loading' && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-violet-50 border border-violet-200 text-xs text-violet-800">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600" />
          Generating descriptions with GPT-4.1…
        </div>
      )}

      {step === 'done' && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 border border-green-200 text-xs text-green-700">
          ✓ Downloaded! Ready to resubmit.
        </div>
      )}

      {step === 'error' && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
          <span>Error: {errorMsg}</span>
          <button type="button" onClick={() => setStep('idle')} className="text-red-500 hover:text-red-700"><X className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  )
}
