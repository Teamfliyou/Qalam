import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { DexieRepository, type Note, type Notebook } from '../src/db/repository'
import { docToMarkdown, docToText } from '../src/lib/serialize'
import { MathEngine } from '../src/engine/engine'

const doc = (root: unknown) => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Soit ' }, { type: 'mathInline', attrs: { data: JSON.stringify(root) } }] },
    { type: 'mathBlock', attrs: { data: JSON.stringify(root) } },
  ],
})

describe('stockage IndexedDB (Dexie)', () => {
  it('les notes sont conservées après « rechargement » (nouvelle instance, même base)', async () => {
    const e = new MathEngine()
    e.type('x^2+1/2')
    const nb: Notebook = { id: 'nb1', name: 'Maths', order: 0, createdAt: 1 }
    const note: Note = { id: 'n1', notebookId: 'nb1', title: 'Analyse', content: doc(e.root), text: 'x', createdAt: 1, updatedAt: 2 }

    const first = new DexieRepository('qalam-test')
    await first.saveNotebook(nb)
    await first.saveNote(note)

    const reloaded = new DexieRepository('qalam-test') // simule un rechargement de page
    expect(await reloaded.listNotebooks()).toEqual([nb])
    expect(await reloaded.listNotes()).toEqual([note])
  })

  it('supprimer un carnet supprime ses notes', async () => {
    const r = new DexieRepository('qalam-test2')
    await r.saveNotebook({ id: 'a', name: 'A', order: 0, createdAt: 1 })
    await r.saveNote({ id: 'x', notebookId: 'a', title: '', content: null, text: '', createdAt: 1, updatedAt: 1 })
    await r.deleteNotebook('a')
    expect(await r.listNotes()).toEqual([])
    expect(await r.listNotebooks()).toEqual([])
  })
})

describe('export', () => {
  const e = new MathEngine()
  e.type('x^2+1/2')

  it('Markdown + LaTeX : $…$ en ligne, $$…$$ en bloc', () => {
    const md = docToMarkdown('Titre', doc(e.root))
    expect(md).toContain('# Titre')
    expect(md).toContain('Soit $x^{2}+\\frac{1}{2}$')
    expect(md).toContain('$$\nx^{2}+\\frac{1}{2}\n$$')
  })

  it('texte de recherche : contient le LaTeX des formules', () => {
    expect(docToText(doc(e.root))).toContain('\\frac{1}{2}')
  })
})
