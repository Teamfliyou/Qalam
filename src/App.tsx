import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor as TipTapEditor } from '@tiptap/react'
import { Sidebar } from './components/Sidebar'
import { HelpDialog, SettingsDialog } from './components/Dialogs'
import { Editor } from './editor/Editor'
import { useMathActive } from './editor/mathState'
import { useData } from './store/data'
import { useSettings } from './store/settings'
import { exportNoteMarkdown, exportNotePdf } from './lib/exporters'

export default function App() {
  const d = useData()
  const theme = useSettings((s) => s.theme)
  const patch = useSettings((s) => s.patch)
  const [help, setHelp] = useState(false)
  const [settings, setSettings] = useState(false)
  const [drawer, setDrawer] = useState(false)

  useEffect(() => void d.init(), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Ctrl+/ : aide-mémoire (en phase de capture, donc aussi depuis une formule)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '/' || e.code === 'Slash')) {
        e.preventDefault()
        e.stopPropagation()
        setHelp((h) => !h)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  if (!d.ready) return <div className="grid h-dvh place-items-center bg-paper text-muted">Chargement…</div>

  const note = d.notes.find((n) => n.id === d.activeNoteId) ?? null

  return (
    <div className="flex h-dvh bg-paper text-ink">
      {/* barre latérale : fixe sur grand écran, tiroir sur mobile */}
      <aside className="hidden w-72 shrink-0 border-r border-line md:block">
        <Sidebar />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 left-0 w-[82%] max-w-xs border-r border-line shadow-xl" onClick={(e) => e.stopPropagation()}>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-sheet">
        <header className="flex items-center gap-1 border-b border-line px-3 py-2 sm:px-5">
          <button className="rounded-md px-2 py-1 text-lg text-muted hover:bg-line/60 md:hidden" onClick={() => setDrawer(true)} aria-label="Ouvrir les carnets">
            ☰
          </button>
          <span className="min-w-0 flex-1 truncate px-2 text-xs text-muted">
            {d.notebooks.find((n) => n.id === d.activeNotebookId)?.name}
          </span>
          {note && <ExportMenu onMd={() => exportNoteMarkdown(note)} onPdf={() => exportNotePdf(note)} />}
          <HeaderBtn label="Aide-mémoire (Ctrl+/)" onClick={() => setHelp(true)}>?</HeaderBtn>
          <HeaderBtn label={theme === 'dark' ? 'Mode clair' : 'Mode sombre'} onClick={() => patch({ theme: theme === 'dark' ? 'light' : 'dark' })}>
            {theme === 'dark' ? '☀' : '☾'}
          </HeaderBtn>
          <HeaderBtn label="Paramètres" onClick={() => setSettings(true)}>⚙</HeaderBtn>
        </header>

        {note ? <NoteView key={note.id} noteId={note.id} /> : <EmptyState />}
        <StatusBar />
      </main>

      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {settings && <SettingsDialog onClose={() => setSettings(false)} />}
    </div>
  )
}

function HeaderBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={label} aria-label={label} onClick={onClick} className="h-8 min-w-8 rounded-md px-2 text-muted transition-colors hover:bg-line/60 hover:text-ink">
      {children}
    </button>
  )
}

function ExportMenu({ onMd, onPdf }: { onMd: () => void; onPdf: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const item = 'block w-full px-3 py-2 text-left text-sm hover:bg-line/60'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="h-8 rounded-md px-2 text-sm text-muted transition-colors hover:bg-line/60 hover:text-ink" aria-haspopup="menu" aria-expanded={open}>
        Exporter ▾
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-sheet shadow-lg">
          <button role="menuitem" className={item} onClick={() => { onMd(); setOpen(false) }}>Markdown + LaTeX (.md)</button>
          <button role="menuitem" className={item} onClick={() => { onPdf(); setOpen(false) }}>PDF (impression)</button>
          <p className="border-t border-line px-3 py-2 text-xs text-muted">Carnet entier : icône ⇩ dans la barre latérale. Formule : bouton « LaTeX » ou Ctrl+C.</p>
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  const createNote = useData((s) => s.createNote)
  return (
    <div className="grid flex-1 place-items-center p-8 text-center">
      <div>
        <p className="font-serif text-3xl italic text-accent">قلم</p>
        <p className="mt-2 text-muted">Aucune note sélectionnée.</p>
        <button className="mt-4 rounded-md bg-accent px-4 py-2 text-white hover:opacity-90" onClick={() => void createNote()}>
          Écrire une note
        </button>
      </div>
    </div>
  )
}

/** Une note : titre + éditeur riche (remonté à chaque changement de note). */
function NoteView({ noteId }: { noteId: string }) {
  const note = useData((s) => s.notes.find((n) => n.id === noteId))!
  const updateNote = useData((s) => s.updateNote)
  const edRef = useRef<TipTapEditor | null>(null)
  const initial = useRef(note.content)
  const onChange = useCallback((json: Parameters<typeof updateNote>[1]['content']) => updateNote(noteId, { content: json }), [noteId, updateNote])
  const onReady = useCallback((e: TipTapEditor) => (edRef.current = e), [])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto w-full max-w-[46rem] px-5 pb-1 pt-6 sm:px-8">
        <input
          value={note.title}
          onChange={(e) => updateNote(noteId, { title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              edRef.current?.commands.focus('start')
            }
          }}
          placeholder="Titre de la note"
          aria-label="Titre de la note"
          className="w-full bg-transparent font-serif text-4xl font-medium text-ink outline-none placeholder:text-muted/60"
        />
      </div>
      <Editor content={initial.current} onChange={onChange} onReady={onReady} />
    </div>
  )
}

/** Barre d'état : indicateur discret « formule » + enregistrement automatique. */
function StatusBar() {
  const active = useMathActive((s) => s.active)
  const saving = useData((s) => s.saving)
  const savedAt = useData((s) => s.savedAt)
  return (
    <footer className="flex items-center justify-between border-t border-line px-4 py-1 text-xs text-muted">
      <span className={`flex items-center gap-1.5 transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`} aria-live="polite">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        Mode formule — Échap pour sortir · Ctrl+/ aide
      </span>
      <span>{saving ? 'Enregistrement…' : savedAt ? 'Enregistré' : ''}</span>
    </footer>
  )
}
