/**
 * sanitize.ts — centralized HTML sanitization
 *
 * Single source of truth for all DOMPurify configuration.
 * All dangerouslySetInnerHTML call sites must go through one of
 * the functions below — no ad-hoc DOMPurify options elsewhere.
 *
 * Adding a new tag or attribute requires a deliberate change here
 * and a code-review gate, making it easy to audit the full allowlist.
 *
 * Security: ALLOWED_URI_REGEXP blocks javascript:, data:, vbscript:
 * and any other potentially executable URI scheme.
 */

import DOMPurify from 'dompurify'

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sanitize TipTap-generated HTML before rendering via dangerouslySetInnerHTML.
 * Tag list matches what TipTap starter-kit + underline/text-style/color
 * extensions can emit. Anything outside this set is stripped.
 * Use for note content and rich text editor output.
 */
export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's',
      'ul', 'ol', 'li',
      'blockquote', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4',
      'a', 'span',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|[/]|#)/i,
    ADD_ATTR: ['target', 'rel'],
  }) as string
}

/**
 * Sanitize AI-generated or simple markdown-converted HTML.
 * More restrictive than sanitizeRichText — strips links and styled spans.
 * Use for AI chat message rendering.
 */
export function sanitizeInlineHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'code', 'pre'],
    ALLOWED_ATTR: [],
  }) as string
}

/**
 * Strip ALL HTML — for plain-text fields that should never contain markup.
 * Handles malformed HTML, attribute-based XSS, and URL-attribute attack vectors.
 * Returns null if the result is empty after sanitization.
 */
export function sanitizeText(val: string | null | undefined): string | null {
  if (val == null || val === '') return null
  const cleaned = DOMPurify.sanitize(String(val), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim()
  return cleaned || null
}
