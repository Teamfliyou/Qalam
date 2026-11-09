/**
 * État de l'application (Zustand) : carnets, notes, sélection, recherche.
 * Les écritures vers le stockage sont regroupées (debounce) pour la sauvegarde automatique.
 */
import { create } from 'zustand'
import type { JSONContent } from '@tiptap/core'
import { repo, type Note, type Notebook, type NotebookExport } from '../db/repository'
import { docToText } from '../lib/serialize'

const uid = () => crypto.randomUUID()

interface DataStore {
  ready: boolean
  notebooks: Notebook[]
  notes: Note[]
  activeNotebookId: string | null
  activeNoteId: string | null
  query: string
  /** Dernier enregistrement réussi (indicateur « Enregistré »). */
  savedAt: number | null
  saving: boolean

  init: () => Promise<void>
  selectNotebook: (id: string) => void
  selectNote: (id: string) => void
  setQuery: (q: string) => void
  createNotebook: (name?: string) => Promise<string>
  renameNotebook: (id: string, name: string) => void
  deleteNotebook: (id: string) => Promise<void>
  createNote: (notebookId?: string) => Promise<string>
  updateNote: (id: string, patch: { title?: string; content?: JSONContent }) => void
  deleteNote: (id: string) => Promise<void>
  moveNote: (id: string, notebookId: string) => void
  importNotebook: (data: NotebookExport) => Promise<void>
  flush: () => Promise<void>
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()
/** `init` ne doit s'exécuter qu'une fois (React StrictMode monte les effets deux fois en dev). */
let initPromise: Promise<void> | null = null

export const useData = create<DataStore>((set, get) => {
  /** Programme l'écriture d'une note (500 ms après la dernière modification). */
  const scheduleSave = (id: string) => {
    clearTimeout(timers.get(id))
    set({ saving: true })
    timers.set(
      id,
      setTimeout(async () => {
        timers.delete(id)
        const note = get().notes.find((n) => n.id === id)
        if (note) await repo.saveNote(note)
        set({ saving: timers.size > 0, savedAt: Date.now() })
      }, 500),
    )
  }

  return {
    ready: false,
    notebooks: [],
    notes: [],
    activeNotebookId: null,
    activeNoteId: null,
    query: '',
    savedAt: null,
    saving: false,

    init() {
      return (initPromise ??= (async () => {
        let notebooks = await repo.listNotebooks()
        let notes = await repo.listNotes()
        if (notebooks.length === 0) {
          // premier lancement : un carnet et une note d'accueil
          const nb: Notebook = { id: uid(), name: 'Mon premier carnet', order: 0, createdAt: Date.now() }
          const note = welcomeNote(nb.id)
          await repo.saveNotebook(nb)
          await repo.saveNote(note)
          notebooks = [nb]
          notes = [note]
        }
        const first = [...notes].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        set({
          ready: true,
          notebooks,
          notes,
          activeNotebookId: first?.notebookId ?? notebooks[0].id,
          activeNoteId: first?.id ?? null,
        })
      })())
    },

    selectNotebook: (id) => {
      const first = get()
        .notes.filter((n) => n.notebookId === id)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0]
      set({ activeNotebookId: id, activeNoteId: first?.id ?? null })
    },
    selectNote: (id) => {
      const n = get().notes.find((x) => x.id === id)
      if (n) set({ activeNoteId: id, activeNotebookId: n.notebookId })
    },
    setQuery: (q) => set({ query: q }),

    async createNotebook(name = 'Nouveau carnet') {
      const nb: Notebook = {
        id: uid(),
        name,
        order: Math.max(-1, ...get().notebooks.map((n) => n.order)) + 1,
        createdAt: Date.now(),
      }
      await repo.saveNotebook(nb)
      set({ notebooks: [...get().notebooks, nb], activeNotebookId: nb.id, activeNoteId: null })
      return nb.id
    },

    renameNotebook(id, name) {
      const nb = get().notebooks.find((n) => n.id === id)
      if (!nb) return
      const next = { ...nb, name: name.trim() || nb.name }
      set({ notebooks: get().notebooks.map((n) => (n.id === id ? next : n)) })
      void repo.saveNotebook(next)
    },

    async deleteNotebook(id) {
      await repo.deleteNotebook(id)
      const notebooks = get().notebooks.filter((n) => n.id !== id)
      const notes = get().notes.filter((n) => n.notebookId !== id)
      const nextNb = notebooks[0]?.id ?? null
      set({ notebooks, notes })
      if (get().activeNotebookId === id) {
        if (nextNb) get().selectNotebook(nextNb)
        else set({ activeNotebookId: null, activeNoteId: null })
      }
    },

    async createNote(notebookId) {
      const nbId = notebookId ?? get().activeNotebookId ?? get().notebooks[0]?.id ?? (await get().createNotebook())
      const now = Date.now()
      const note: Note = { id: uid(), notebookId: nbId, title: '', content: null, text: '', createdAt: now, updatedAt: now }
      await repo.saveNote(note)
      set({ notes: [note, ...get().notes], activeNotebookId: nbId, activeNoteId: note.id, query: '' })
      return note.id
    },

    updateNote(id, patch) {
      const notes = get().notes.map((n) => {
        if (n.id !== id) return n
        const content = patch.content ?? n.content
        const title = patch.title ?? n.title
        return {
          ...n,
          title,
          content,
          text: patch.content ? docToText(patch.content) : n.text,
          updatedAt: Date.now(),
        }
      })
      set({ notes })
      scheduleSave(id)
    },

    async deleteNote(id) {
      clearTimeout(timers.get(id))
      timers.delete(id)
      await repo.deleteNote(id)
      const removed = get().notes.find((n) => n.id === id)
      const notes = get().notes.filter((n) => n.id !== id)
      set({ notes })
      if (get().activeNoteId === id) {
        const next = notes.filter((n) => n.notebookId === removed?.notebookId).sort((a, b) => b.updatedAt - a.updatedAt)[0]
        set({ activeNoteId: next?.id ?? null })
      }
    },

    moveNote(id, notebookId) {
      const n = get().notes.find((x) => x.id === id)
      if (!n || n.notebookId === notebookId) return
      const next = { ...n, notebookId }
      set({ notes: get().notes.map((x) => (x.id === id ? next : x)) })
      void repo.saveNote(next)
    },

    async importNotebook(data) {
      const nbId = uid()
      const nb: Notebook = {
        id: nbId,
        name: data.notebook.name + ' (importé)',
        order: get().notebooks.length,
        createdAt: Date.now(),
      }
      const notes = data.notes.map((n) => ({ ...n, id: uid(), notebookId: nbId }))
      await repo.saveNotebook(nb)
      for (const n of notes) await repo.saveNote(n)
      set({ notebooks: [...get().notebooks, nb], notes: [...get().notes, ...notes] })
      get().selectNotebook(nbId)
    },

    async flush() {
      for (const [id, t] of timers) {
        clearTimeout(t)
        timers.delete(id)
        const note = get().notes.find((n) => n.id === id)
        if (note) await repo.saveNote(note)
      }
      set({ saving: false, savedAt: Date.now() })
    },
  }
})

/** Note d'accueil : présente la saisie intelligente. */
function welcomeNote(notebookId: string): Note {
  const m = (root: unknown) => ({ type: 'mathInline', attrs: { data: JSON.stringify(root) } })
  const c = (s: string) => [...s].map((ch) => ({ t: 'char', c: ch }))
  const content: JSONContent = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Bienvenue dans Qalam' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Tapez des maths au clavier, la mise en forme se fait toute seule. Essayez : ' },
          m([
            ...c('x'),
            { t: 'sup', rows: [c('2')], auto: true },
            ...c('+'),
            { t: 'frac', rows: [c('1'), c('2')] },
          ]),
          { type: 'text', text: ' s’obtient en tapant simplement ' },
          { type: 'text', text: '$x^2+1/2', marks: [{ type: 'code' }] },
          { type: 'text', text: ' puis Échap.' },
        ],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Ctrl+/ ouvre l’aide-mémoire des raccourcis. Un bloc centré s’ouvre avec ' },
          { type: 'text', text: '$$', marks: [{ type: 'code' }] },
          { type: 'text', text: ' :' },
        ],
      },
      {
        type: 'mathBlock',
        attrs: {
          data: JSON.stringify([
            { t: 'frac', rows: [[{ t: 'char', c: '-' }, ...c('b'), { t: 'sym', latex: '\\pm', raw: '+-', op: true }, { t: 'sqrt', rows: [[...c('b'), { t: 'sup', rows: [c('2')], auto: true }, ...c('-4ac')]] }], c('2a')] },
          ]),
        },
      },
      { type: 'paragraph' },
    ],
  }
  const now = Date.now()
  return { id: uid(), notebookId, title: 'Bienvenue', content, text: docToText(content), createdAt: now, updatedAt: now }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => void useData.getState().flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void useData.getState().flush()
  })
}
