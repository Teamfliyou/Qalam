import { useEffect } from 'react'
import { EditorContent, useEditor, type Editor as TipTapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import type { JSONContent } from '@tiptap/core'
import { MathBlock, MathInline } from './MathNodes'
import { AutoMath } from './AutoMath'
import { convertInlineToBlock, insertMath } from './mathCommands'
import { lastNav } from './mathState'
import { matchesKey, useSettings } from '../store/settings'

interface Props {
  content: JSONContent | null
  onChange: (json: JSONContent) => void
  onReady?: (editor: TipTapEditor) => void
}

/** Éditeur riche (titres, listes, cases à cocher, gras/italique, code) + formules. */
export function Editor({ content, onChange, onReady }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Écrivez ici… tapez $ pour une formule, $$ pour un bloc centré.' }),
      MathInline,
      MathBlock,
      AutoMath,
    ],
    content: content ?? '',
    autofocus: 'end',
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
    editorProps: {
      attributes: { class: 'qprose', spellcheck: 'true', lang: 'fr' },
      handleKeyDown: (view, event) => {
        if (event.key === 'ArrowRight') lastNav.dir = 'right'
        else if (event.key === 'ArrowLeft') lastNav.dir = 'left'
        if (matchesKey(event, useSettings.getState().mathKey)) {
          event.preventDefault()
          const ed = (view as unknown as { dom: { editor?: TipTapEditor } }).dom.editor
          if (ed) {
            const { from, to } = ed.state.selection
            const seed = from !== to ? ed.state.doc.textBetween(from, to, ' ') : undefined
            if (seed) ed.chain().focus().deleteRange({ from, to }).run()
            insertMath(ed, 'inline', seed)
          }
          return true
        }
        return false
      },
      // `$` ouvre une formule en ligne ; `$$` (deuxième `$` tout de suite) un bloc centré
      handleTextInput: (view, from, _to, text) => {
        if (text !== '$') return false
        const ed = (view as unknown as { dom: { editor?: TipTapEditor } }).dom.editor
        if (!ed) return false
        const { selection } = view.state
        const before = selection.$from.nodeBefore
        if (before && before.type.name === 'mathInline' && before.attrs.data === '[]') {
          convertInlineToBlock(ed, selection.from - before.nodeSize, before)
          return true
        }
        insertMath(ed, 'inline')
        return true
      },
    },
  })

  useEffect(() => {
    if (editor) {
      ;(editor.view.dom as unknown as { editor: TipTapEditor }).editor = editor
      onReady?.(editor)
    }
  }, [editor, onReady])

  if (!editor) return null
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
        <EditorContent editor={editor} className="qeditor mx-auto w-full max-w-[46rem] px-5 pb-40 pt-2 sm:px-8" />
      </div>
    </div>
  )
}

function Toolbar({ editor }: { editor: TipTapEditor }) {
  const btn = (label: string, title: string, active: boolean, run: () => void, extra = '') => (
    <button
      key={title}
      type="button"
      title={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`h-8 min-w-8 rounded-md px-2 text-sm transition-colors hover:bg-line/70 ${active ? 'bg-line text-ink' : 'text-muted'} ${extra}`}
    >
      {label}
    </button>
  )
  const c = () => editor.chain().focus()
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-line px-3 py-1.5 sm:px-6" role="toolbar" aria-label="Mise en forme">
      {btn('H1', 'Titre 1', editor.isActive('heading', { level: 1 }), () => c().toggleHeading({ level: 1 }).run(), 'font-semibold')}
      {btn('H2', 'Titre 2', editor.isActive('heading', { level: 2 }), () => c().toggleHeading({ level: 2 }).run(), 'font-semibold')}
      {btn('H3', 'Titre 3', editor.isActive('heading', { level: 3 }), () => c().toggleHeading({ level: 3 }).run(), 'font-semibold')}
      <span className="mx-1 h-4 w-px bg-line" />
      {btn('G', 'Gras (Ctrl+B)', editor.isActive('bold'), () => c().toggleBold().run(), 'font-bold')}
      {btn('I', 'Italique (Ctrl+I)', editor.isActive('italic'), () => c().toggleItalic().run(), 'italic font-serif')}
      {btn('</>', 'Code en ligne', editor.isActive('code'), () => c().toggleCode().run(), 'font-mono text-xs')}
      <span className="mx-1 h-4 w-px bg-line" />
      {btn('• Liste', 'Liste à puces', editor.isActive('bulletList'), () => c().toggleBulletList().run())}
      {btn('1. Liste', 'Liste numérotée', editor.isActive('orderedList'), () => c().toggleOrderedList().run())}
      {btn('☑ Tâches', 'Cases à cocher', editor.isActive('taskList'), () => c().toggleTaskList().run())}
      {btn('❝', 'Citation', editor.isActive('blockquote'), () => c().toggleBlockquote().run())}
      {btn('{ }', 'Bloc de code', editor.isActive('codeBlock'), () => c().toggleCodeBlock().run(), 'font-mono text-xs')}
      <span className="mx-1 h-4 w-px bg-line" />
      {btn('∑ en ligne', 'Formule en ligne ($ ou Ctrl+M)', false, () => insertMath(editor, 'inline'), 'text-accent')}
      {btn('∑ bloc', 'Formule centrée ($$)', false, () => insertMath(editor, 'block'), 'text-accent')}
    </div>
  )
}
