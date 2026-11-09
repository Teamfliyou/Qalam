/**
 * Conversions du contenu TipTap (JSON) : texte brut (recherche), Markdown+LaTeX, HTML (PDF).
 */
import katex from 'katex'
import type { JSONContent } from '@tiptap/core'
import { MathEngine } from '../engine/engine'
import type { Row } from '../engine/model'

export function parseTree(data: unknown): Row {
  try {
    const v = typeof data === 'string' ? JSON.parse(data) : data
    return Array.isArray(v) ? (v as Row) : []
  } catch {
    return []
  }
}

/** LaTeX propre d'un nœud formule (attribut `data` = arbre JSON). */
export function latexOf(data: unknown, times: 'times' | 'cdot' = 'times'): string {
  const e = new MathEngine(undefined, { times })
  e.load(parseTree(data))
  return e.latex()
}

type Visit = (n: JSONContent) => string

function children(n: JSONContent, v: Visit, sep = ''): string {
  return (n.content ?? []).map(v).join(sep)
}

/** Texte brut (titres, paragraphes, formules en LaTeX) pour la recherche plein texte. */
export function docToText(doc: JSONContent | null): string {
  if (!doc) return ''
  const v: Visit = (n) => {
    switch (n.type) {
      case 'text':
        return n.text ?? ''
      case 'mathInline':
      case 'mathBlock':
        return ' ' + latexOf(n.attrs?.data) + ' '
      case 'hardBreak':
        return '\n'
      case 'doc':
        return children(n, v, '\n')
      default:
        return children(n, v, n.type === 'paragraph' || n.type === 'heading' ? '' : '\n') + (n.content ? '' : '')
    }
  }
  return v(doc).replace(/\n{3,}/g, '\n\n').trim()
}

// ─────────────────────────────── Markdown ───────────────────────────────

function applyMarks(text: string, marks: JSONContent['marks'] = []): string {
  let s = text
  for (const m of marks ?? []) {
    if (m.type === 'code') s = '`' + s + '`'
    else if (m.type === 'bold') s = `**${s}**`
    else if (m.type === 'italic') s = `*${s}*`
    else if (m.type === 'strike') s = `~~${s}~~`
  }
  return s
}

export function docToMarkdown(title: string, doc: JSONContent | null): string {
  const block = (n: JSONContent, indent = ''): string => {
    switch (n.type) {
      case 'paragraph':
        return indent + inline(n)
      case 'heading':
        return '#'.repeat(n.attrs?.level ?? 1) + ' ' + inline(n)
      case 'blockquote':
        return (n.content ?? []).map((c) => block(c)).join('\n\n').split('\n').map((l) => '> ' + l).join('\n')
      case 'codeBlock':
        return '```' + (n.attrs?.language ?? '') + '\n' + (n.content ?? []).map((c) => c.text ?? '').join('') + '\n```'
      case 'horizontalRule':
        return '---'
      case 'mathBlock':
        return '$$\n' + latexOf(n.attrs?.data) + '\n$$'
      case 'bulletList':
        return (n.content ?? []).map((li) => listItem(li, '- ', indent)).join('\n')
      case 'orderedList':
        return (n.content ?? []).map((li, i) => listItem(li, `${i + 1}. `, indent)).join('\n')
      case 'taskList':
        return (n.content ?? [])
          .map((li) => listItem(li, li.attrs?.checked ? '- [x] ' : '- [ ] ', indent))
          .join('\n')
      default:
        return (n.content ?? []).map((c) => block(c, indent)).join('\n\n')
    }
  }
  const listItem = (li: JSONContent, bullet: string, indent: string): string => {
    const parts = (li.content ?? []).map((c) =>
      c.type === 'bulletList' || c.type === 'orderedList' || c.type === 'taskList'
        ? block(c, indent + '  ')
        : block(c),
    )
    return indent + bullet + parts.join('\n' + indent + '  ')
  }
  const inline = (n: JSONContent): string =>
    (n.content ?? [])
      .map((c) => {
        if (c.type === 'text') return applyMarks(c.text ?? '', c.marks)
        if (c.type === 'mathInline') return '$' + latexOf(c.attrs?.data) + '$'
        if (c.type === 'hardBreak') return '  \n'
        return ''
      })
      .join('')
  const body = doc ? (doc.content ?? []).map((c) => block(c)).join('\n\n') : ''
  return `# ${title || 'Sans titre'}\n\n${body}\n`
}

// ─────────────────────────────── HTML (PDF) ───────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function renderMath(data: unknown, display: boolean): string {
  const e = new MathEngine()
  e.load(parseTree(data))
  return katex.renderToString(e.displayLatex(), { displayMode: display, throwOnError: false, strict: 'ignore' })
}

export function docToHtml(doc: JSONContent | null): string {
  const inline = (n: JSONContent): string =>
    (n.content ?? [])
      .map((c) => {
        if (c.type === 'text') {
          let s = esc(c.text ?? '')
          for (const m of c.marks ?? []) {
            if (m.type === 'bold') s = `<strong>${s}</strong>`
            else if (m.type === 'italic') s = `<em>${s}</em>`
            else if (m.type === 'code') s = `<code>${s}</code>`
            else if (m.type === 'strike') s = `<s>${s}</s>`
          }
          return s
        }
        if (c.type === 'mathInline') return renderMath(c.attrs?.data, false)
        if (c.type === 'hardBreak') return '<br>'
        return ''
      })
      .join('')
  const block = (n: JSONContent): string => {
    const kids = () => (n.content ?? []).map(block).join('')
    switch (n.type) {
      case 'paragraph': return `<p>${inline(n)}</p>`
      case 'heading': return `<h${n.attrs?.level ?? 1}>${inline(n)}</h${n.attrs?.level ?? 1}>`
      case 'blockquote': return `<blockquote>${kids()}</blockquote>`
      case 'codeBlock': return `<pre><code>${esc((n.content ?? []).map((c) => c.text ?? '').join(''))}</code></pre>`
      case 'horizontalRule': return '<hr>'
      case 'mathBlock': return `<div class="mb">${renderMath(n.attrs?.data, true)}</div>`
      case 'bulletList': return `<ul>${kids()}</ul>`
      case 'orderedList': return `<ol>${kids()}</ol>`
      case 'taskList': return `<ul class="tasks">${kids()}</ul>`
      case 'listItem': return `<li>${kids()}</li>`
      case 'taskItem': return `<li class="task">${n.attrs?.checked ? '☑' : '☐'} <div>${kids()}</div></li>`
      default: return kids()
    }
  }
  return doc ? (doc.content ?? []).map(block).join('') : ''
}
