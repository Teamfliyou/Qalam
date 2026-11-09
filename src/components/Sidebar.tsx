import { useMemo, useRef, useState } from 'react'
import { useData } from '../store/data'
import { exportNotebookJson, parseNotebookExport } from '../lib/exporters'

/** Extrait de texte autour de la première occurrence de la requête. */
function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return ''
  const s = Math.max(0, i - 24)
  return (s > 0 ? '…' : '') + text.slice(s, i + q.length + 50).replace(/\s+/g, ' ')
}

/** Barre latérale : recherche, carnets, notes (renommer, supprimer, glisser-déposer). */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const d = useData()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const q = d.query.trim()

  const results = useMemo(() => {
    if (!q) return []
    const lq = q.toLowerCase()
    return d.notes
      .filter((n) => n.title.toLowerCase().includes(lq) || n.text.toLowerCase().includes(lq))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [d.notes, q])

  const toggle = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const importFile = async (f: File) => {
    try {
      await d.importNotebook(parseNotebookExport(await f.text()))
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const iconBtn = 'rounded p-1 text-muted opacity-0 transition hover:bg-line hover:text-ink focus:opacity-100 group-hover:opacity-100'

  return (
    <nav className="flex h-full w-full flex-col bg-side text-sm" aria-label="Carnets et notes">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <span className="font-serif text-2xl italic text-accent">Qalam</span>
        <span className="text-xs text-muted">قلم</span>
      </div>
      <div className="px-3 pb-2">
        <input
          type="search"
          value={d.query}
          onChange={(e) => d.setQuery(e.target.value)}
          placeholder="Rechercher…"
          aria-label="Recherche plein texte"
          className="w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-ink outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {q ? (
          <div>
            <p className="px-2 py-1 text-xs text-muted">{results.length} résultat{results.length > 1 ? 's' : ''}</p>
            {results.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  d.selectNote(n.id)
                  onNavigate?.()
                }}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-line/60"
              >
                <span className="block truncate text-ink">{n.title || 'Sans titre'}</span>
                <span className="block truncate text-xs text-muted">{snippet(n.text, q) || d.notebooks.find((b) => b.id === n.notebookId)?.name}</span>
              </button>
            ))}
          </div>
        ) : (
          d.notebooks.map((nb) => {
            const notes = d.notes.filter((n) => n.notebookId === nb.id).sort((a, b) => b.updatedAt - a.updatedAt)
            const open = !collapsed.has(nb.id)
            return (
              <div
                key={nb.id}
                className={`mb-1 rounded-md ${dropTarget === nb.id ? 'bg-accent/15 ring-1 ring-accent' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropTarget(nb.id)
                }}
                onDragLeave={() => setDropTarget((t) => (t === nb.id ? null : t))}
                onDrop={(e) => {
                  e.preventDefault()
                  setDropTarget(null)
                  const id = e.dataTransfer.getData('text/qalam-note')
                  if (id) d.moveNote(id, nb.id)
                }}
              >
                <div className="group flex items-center gap-1 rounded-md px-1 py-1 hover:bg-line/50">
                  <button onClick={() => toggle(nb.id)} className="w-5 text-muted" aria-label={open ? 'Replier' : 'Déplier'}>
                    {open ? '▾' : '▸'}
                  </button>
                  {renaming === nb.id ? (
                    <input
                      autoFocus
                      defaultValue={nb.name}
                      className="min-w-0 flex-1 rounded border border-accent bg-paper px-1 text-ink outline-none"
                      onBlur={(e) => {
                        d.renameNotebook(nb.id, e.target.value)
                        setRenaming(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => d.selectNotebook(nb.id)}
                      onDoubleClick={() => setRenaming(nb.id)}
                      className={`min-w-0 flex-1 truncate text-left font-medium ${d.activeNotebookId === nb.id ? 'text-ink' : 'text-muted'}`}
                      title="Double-clic pour renommer"
                    >
                      {nb.name}
                    </button>
                  )}
                  <button className={iconBtn} title="Nouvelle note" aria-label="Nouvelle note" onClick={() => void d.createNote(nb.id).then(() => onNavigate?.())}>＋</button>
                  <button className={iconBtn} title="Renommer" aria-label="Renommer le carnet" onClick={() => setRenaming(nb.id)}>✎</button>
                  <button className={iconBtn} title="Exporter le carnet (JSON)" aria-label="Exporter le carnet" onClick={() => void exportNotebookJson(nb)}>⇩</button>
                  <button
                    className={iconBtn}
                    title="Supprimer le carnet"
                    aria-label="Supprimer le carnet"
                    onClick={() => confirm(`Supprimer le carnet « ${nb.name} » et ses ${notes.length} note(s) ?`) && void d.deleteNotebook(nb.id)}
                  >
                    🗑
                  </button>
                </div>
                {open && (
                  <ul className="ml-4 border-l border-line pl-1">
                    {notes.length === 0 && <li className="px-2 py-1 text-xs italic text-muted">Aucune note</li>}
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('text/qalam-note', n.id)}
                        className={`group flex items-center rounded-md ${d.activeNoteId === n.id ? 'bg-line' : 'hover:bg-line/50'}`}
                      >
                        <button
                          onClick={() => {
                            d.selectNote(n.id)
                            onNavigate?.()
                          }}
                          className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-ink"
                        >
                          {n.title || <span className="italic text-muted">Sans titre</span>}
                        </button>
                        <button
                          className={iconBtn}
                          title="Supprimer la note"
                          aria-label="Supprimer la note"
                          onClick={() => confirm(`Supprimer la note « ${n.title || 'Sans titre'} » ?`) && void d.deleteNote(n.id)}
                        >
                          🗑
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="flex gap-2 border-t border-line p-3">
        <button className="flex-1 rounded-md bg-accent px-3 py-1.5 text-white hover:opacity-90" onClick={() => void d.createNote().then(() => onNavigate?.())}>
          ＋ Note
        </button>
        <button className="rounded-md border border-line px-3 py-1.5 text-ink hover:bg-line/60" onClick={() => void d.createNotebook()}>
          ＋ Carnet
        </button>
        <button className="rounded-md border border-line px-2 py-1.5 text-muted hover:bg-line/60" title="Importer un carnet (JSON)" aria-label="Importer un carnet" onClick={() => fileRef.current?.click()}>
          ⇧
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
      </div>
    </nav>
  )
}
