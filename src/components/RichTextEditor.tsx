import React, { useState, useCallback } from 'react'
import { useEditor, EditorContent, Extension } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Minus, RotateCcw, ChevronDown
} from 'lucide-react'

// ── Custom FontSize extension ──────────────────────────────────────────────
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] }
  },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: Record<string, string | null>) => {
            if (!attrs.fontSize) return {}
            return { style: `font-size: ${attrs.fontSize}` }
          },
        },
      },
    }]
  },
  addCommands(): Record<string, (...args: unknown[]) => unknown> {
    return {
      setFontSize: (size: string) => ({ chain }: { chain: () => { setMark: (name: string, attrs: Record<string, string>) => { run: () => boolean } } }) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: { chain: () => { setMark: (name: string, attrs: Record<string, null>) => { removeEmptyTextStyle?: () => { run: () => boolean }, run: () => boolean } } }) =>
        chain().setMark('textStyle', { fontSize: null }).run(),
    }
  },
})

// ── Preset palette ─────────────────────────────────────────────────────────
const COLORS = [
  { label: 'Default', value: '' },
  { label: 'Black', value: '#000000' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Red', value: '#ef4444' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Yellow', value: '#eab308' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Teal', value: '#14b8a6' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Purple', value: '#a855f7' },
]

const FONT_SIZES = [
  { label: 'Small', value: '0.75rem' },
  { label: 'Normal', value: '' },
  { label: 'Large', value: '1.125rem' },
  { label: 'X-Large', value: '1.375rem' },
  { label: 'Heading', value: '1.75rem' },
]

// ── Props ──────────────────────────────────────────────────────────────────
interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  autoFocus?: boolean
}

// ── Toolbar button ─────────────────────────────────────────────────────────
function ToolBtn({
  active, onClick, title, children, disabled
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={`
        btn btn-xs btn-ghost px-2 h-7 min-h-0 transition-colors
        ${active ? 'bg-primary/15 text-primary border-primary/30' : 'text-base-content/60 hover:text-base-content hover:bg-base-200'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : ''}
      `}
    >
      {children}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Write your note here…',
  minHeight = 120,
  autoFocus = false,
}: RichTextEditorProps) {
  const [colorOpen, setColorOpen] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontSize,
    ],
    content,
    autofocus: autoFocus,
    onUpdate({ editor }) {
      onChange(editor.getHTML())
    },
  })

  const setFontSize = useCallback((size: string) => {
    if (!editor) return
    if (!size) {
      // @ts-expect-error custom command
      editor.chain().focus().unsetFontSize().run()
    } else {
      // @ts-expect-error custom command
      editor.chain().focus().setFontSize(size).run()
    }
    setSizeOpen(false)
  }, [editor])

  const setColor = useCallback((color: string) => {
    if (!editor) return
    if (!color) {
      editor.chain().focus().unsetColor().run()
    } else {
      editor.chain().focus().setColor(color).run()
    }
    setColorOpen(false)
  }, [editor])

  if (!editor) return null

  // Current active color swatch
  const currentColor = editor.getAttributes('textStyle').color || ''

  return (
    <div className="border border-base-300 rounded-lg overflow-hidden focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all bg-base-100">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-base-200 bg-base-50">

        {/* Text style */}
        <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
          <Bold size={13} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
          <Italic size={13} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
          <UnderlineIcon size={13} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
          <Strikethrough size={13} />
        </ToolBtn>

        {/* Divider */}
        <span className="w-px h-4 bg-base-300 mx-1" />

        {/* Font size dropdown */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setSizeOpen(v => !v); setColorOpen(false) }}
            className="btn btn-xs btn-ghost h-7 min-h-0 px-2 flex items-center gap-1 text-base-content/60 hover:text-base-content text-xs"
            title="Font size"
          >
            Aa <ChevronDown size={10} />
          </button>
          {sizeOpen && (
            <div className="absolute top-8 left-0 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg py-1 min-w-[110px]">
              {FONT_SIZES.map(({ label, value }) => (
                <button
                  key={label}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); setFontSize(value) }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-base-200 transition-colors"
                  style={{ fontSize: value || '0.875rem' }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Color picker */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setColorOpen(v => !v); setSizeOpen(false) }}
            className="btn btn-xs btn-ghost h-7 min-h-0 px-2 flex items-center gap-1 text-base-content/60 hover:text-base-content"
            title="Text color"
          >
            <span className="font-bold text-sm leading-none" style={{ color: currentColor || 'currentColor' }}>A</span>
            <span
              className="inline-block w-3.5 h-1 rounded-sm mt-0.5"
              style={{ backgroundColor: currentColor || '#9ca3af' }}
            />
            <ChevronDown size={10} />
          </button>
          {colorOpen && (
            <div className="absolute top-8 left-0 z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg p-2">
              <div className="grid grid-cols-5 gap-1.5">
                {COLORS.map(({ label, value }) => (
                  <button
                    key={label}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); setColor(value) }}
                    title={label}
                    className="w-6 h-6 rounded border border-base-300 hover:scale-110 transition-transform flex items-center justify-center"
                    style={{ backgroundColor: value || '#ffffff' }}
                  >
                    {!value && <span className="text-[9px] text-base-content/50 font-bold">×</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <span className="w-px h-4 bg-base-300 mx-1" />

        {/* Lists */}
        <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <List size={13} />
        </ToolBtn>
        <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <ListOrdered size={13} />
        </ToolBtn>

        {/* Divider */}
        <span className="w-px h-4 bg-base-300 mx-1" />

        {/* Horizontal rule */}
        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <Minus size={13} />
        </ToolBtn>

        {/* Clear formatting */}
        <ToolBtn onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Clear formatting">
          <RotateCcw size={13} />
        </ToolBtn>
      </div>

      {/* ── Editor area ─────────────────────────────────────────────────── */}
      <div
        className="relative px-3 py-2"
        style={{ minHeight }}
        onClick={() => { setColorOpen(false); setSizeOpen(false) }}
      >
        {editor.isEmpty && (
          <span className="absolute top-2 left-3 text-sm text-base-content/30 pointer-events-none select-none">
            {placeholder}
          </span>
        )}
        <EditorContent
          editor={editor}
          className="
            prose prose-sm max-w-none text-sm text-base-content
            focus:outline-none
            [&_.ProseMirror]:outline-none
            [&_.ProseMirror]:min-h-[80px]
            [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5
            [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5
            [&_.ProseMirror_li]:my-0.5
            [&_.ProseMirror_hr]:border-base-300 [&_.ProseMirror_hr]:my-2
            [&_.ProseMirror_strong]:font-semibold
            [&_.ProseMirror_em]:italic
            [&_.ProseMirror_s]:line-through
            [&_.ProseMirror_u]:underline
          "
        />
      </div>

    </div>
  )
}

// ── Helper: check if rich-text content is empty ────────────────────────────
export function isRichTextEmpty(html: string): boolean {
  if (!html) return true
  const text = html.replace(/<[^>]*>/g, '').trim()
  return text.length === 0
}
