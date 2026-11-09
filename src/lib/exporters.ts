import katexCssUrl from 'katex/dist/katex.min.css?url'
import { repo, type Note, type Notebook, type NotebookExport } from '../db/repository'
import { docToHtml, docToMarkdown } from './serialize'

function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const slug = (s: string) =>
  (s || 'note').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'note'

/** Note → Markdown + LaTeX ($…$ et $$…$$). */
export function exportNoteMarkdown(note: Note) {
  download(`${slug(note.title)}.md`, docToMarkdown(note.title, note.content), 'text/markdown;charset=utf-8')
}

/** Note → PDF via la boîte de dialogue d'impression du navigateur (« Enregistrer au format PDF »). */
export function exportNotePdf(note: Note) {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  const css = `
    body{font-family:Georgia,'Times New Roman',serif;font-size:12pt;line-height:1.6;color:#111;max-width:42rem;margin:0 auto;padding:1.5cm}
    h1{font-size:22pt;margin:0 0 .6em} h2{font-size:16pt} h3{font-size:13pt}
    .mb{margin:1em 0;text-align:center} pre{background:#f3f3f3;padding:.6em;border-radius:4px;white-space:pre-wrap}
    code{font-family:Consolas,monospace;font-size:.9em} blockquote{border-left:3px solid #bbb;margin-left:0;padding-left:1em;color:#444}
    ul.tasks{list-style:none;padding-left:0} li.task{display:flex;gap:.5em} li.task div{flex:1}
    @media print{body{padding:0}}`
  iframe.srcdoc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${note.title || 'Note'}</title>
    <link rel="stylesheet" href="${new URL(katexCssUrl, location.href).href}"><style>${css}</style></head>
    <body><h1>${(note.title || 'Sans titre').replace(/</g, '&lt;')}</h1>${docToHtml(note.content)}</body></html>`
  iframe.onload = () => {
    // laisse le temps aux polices KaTeX de se charger avant d'imprimer
    setTimeout(() => {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
      setTimeout(() => iframe.remove(), 2000)
    }, 400)
  }
  document.body.appendChild(iframe)
}

/** Carnet → JSON (sauvegarde / transfert). */
export async function exportNotebookJson(notebook: Notebook) {
  const notes = (await repo.listNotes()).filter((n) => n.notebookId === notebook.id)
  const data: NotebookExport = { format: 'qalam-notebook', version: 1, notebook, notes }
  download(`${slug(notebook.name)}.qalam.json`, JSON.stringify(data, null, 2), 'application/json')
}

export function parseNotebookExport(text: string): NotebookExport {
  const d = JSON.parse(text)
  if (d?.format !== 'qalam-notebook' || !d.notebook || !Array.isArray(d.notes)) throw new Error('Fichier de carnet invalide')
  return d as NotebookExport
}
