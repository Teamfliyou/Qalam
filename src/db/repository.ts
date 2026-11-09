/**
 * Couche de stockage abstraite : l'application ne parle qu'à `Repository`.
 * Pour brancher un backend (API REST, Supabase…), il suffit d'écrire une autre
 * implémentation de cette interface et de changer `repo` en bas du fichier.
 */
import Dexie, { type Table } from 'dexie'
import type { JSONContent } from '@tiptap/core'

export interface Notebook {
  id: string
  name: string
  order: number
  createdAt: number
}

export interface Note {
  id: string
  notebookId: string
  title: string
  /** Contenu TipTap (JSON) */
  content: JSONContent | null
  /** Texte brut extrait (recherche plein texte) */
  text: string
  createdAt: number
  updatedAt: number
}

export interface NotebookExport {
  format: 'qalam-notebook'
  version: 1
  notebook: Notebook
  notes: Note[]
}

export interface Repository {
  listNotebooks(): Promise<Notebook[]>
  saveNotebook(nb: Notebook): Promise<void>
  /** Supprime le carnet ET ses notes. */
  deleteNotebook(id: string): Promise<void>
  listNotes(): Promise<Note[]>
  saveNote(note: Note): Promise<void>
  deleteNote(id: string): Promise<void>
}

class QalamDB extends Dexie {
  notebooks!: Table<Notebook, string>
  notes!: Table<Note, string>
  constructor(name = 'qalam') {
    super(name)
    this.version(1).stores({
      notebooks: 'id, order',
      notes: 'id, notebookId, updatedAt',
    })
  }
}

/** Implémentation locale : IndexedDB via Dexie. */
export class DexieRepository implements Repository {
  private db: QalamDB
  constructor(name?: string) {
    this.db = new QalamDB(name)
  }
  listNotebooks() {
    return this.db.notebooks.orderBy('order').toArray()
  }
  async saveNotebook(nb: Notebook) {
    await this.db.notebooks.put(nb)
  }
  async deleteNotebook(id: string) {
    await this.db.transaction('rw', this.db.notebooks, this.db.notes, async () => {
      await this.db.notes.where('notebookId').equals(id).delete()
      await this.db.notebooks.delete(id)
    })
  }
  listNotes() {
    return this.db.notes.toArray()
  }
  async saveNote(note: Note) {
    await this.db.notes.put(note)
  }
  async deleteNote(id: string) {
    await this.db.notes.delete(id)
  }
}

export const repo: Repository = new DexieRepository()
