/**
 * Vue d'une formule dans la note. Un <textarea> invisible capte le clavier PHYSIQUE (ou le clavier
 * système sur mobile) et alimente le MathEngine ; la formule est rendue par KaTeX à chaque frappe.
 * Aucun clavier virtuel n'est affiché.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { MathEngine } from '../engine/engine'
import { buildRules } from '../engine/rules'
import { parseTree } from '../lib/serialize'
import { matchesKey, useSettings } from '../store/settings'
import { lastNav, pendingMath, useMathActive } from './mathState'
import { convertInlineToBlock } from './mathCommands'

const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete', 'Home', 'End']

function renderKatex(latex: string, display: boolean, editing: boolean): string {
  return katex.renderToString(latex, {
    displayMode: display,
    throwOnError: false,
    strict: 'ignore',
    trust: (ctx) => ctx.command === '\\htmlClass',
    output: editing ? 'html' : 'htmlAndMathml',
  })
}

export function MathView({ node, getPos, editor, selected }: NodeViewProps) {
  const block = node.type.name === 'mathBlock'
  const settings = useSettings()
  const taRef = useRef<HTMLTextAreaElement>(null)
  const engineRef = useRef<MathEngine | null>(null)
  const lastData = useRef<string>(node.attrs.data)
  const alive = useRef(true)
  const [, setRev] = useState(0)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!engineRef.current) {
    const e = new MathEngine(buildRules(settings.shortcuts), { times: settings.times })
    e.load(parseTree(node.attrs.data))
    engineRef.current = e
  }
  const eng = engineRef.current

  // les réglages (raccourcis perso, × / ·) s'appliquent immédiatement
  useEffect(() => {
    eng.rules = buildRules(settings.shortcuts)
    eng.opts.times = settings.times
    setRev((r) => r + 1)
  }, [eng, settings.shortcuts, settings.times])

  // le contenu a changé hors édition (annulation de l'éditeur, collage…) → recharger le moteur
  useEffect(() => {
    if (node.attrs.data !== lastData.current) {
      lastData.current = node.attrs.data
      eng.load(parseTree(node.attrs.data))
      setRev((r) => r + 1)
    }
  }, [node.attrs.data, eng])

  const latex = editing ? eng.editLatex() : eng.displayLatex()
  const html = useMemo(() => renderKatex(latex, block, editing), [latex, block, editing])

  /** Écrit l'arbre courant dans le nœud (sans polluer l'historique de l'éditeur). */
  const commit = () => {
    setRev((r) => r + 1)
    const data = JSON.stringify(eng.root)
    if (data === lastData.current) return
    lastData.current = data
    const pos = getPos()
    if (pos == null) return
    const cur = editor.state.doc.nodeAt(pos)
    if (!cur) return
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, data }).setMeta('addToHistory', false),
    )
  }

  const removeSelf = (dir: 'left' | 'right') => {
    const pos = getPos()
    if (pos == null) return
    const { state, view } = editor
    const tr = state.tr.delete(pos, pos + node.nodeSize)
    const sel = TextSelection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), dir === 'left' ? -1 : 1)
    view.dispatch(tr.setSelection(sel))
    view.focus()
  }

  /** Quitte la formule : le curseur retourne dans le texte, avant ou après. */
  const exit = (dir: 'left' | 'right') => {
    const pos = getPos()
    if (pos == null) return
    if (eng.isEmpty) return removeSelf(dir)
    const { state, view } = editor
    let tr = state.tr
    if (dir === 'right') {
      const after = pos + node.nodeSize
      if (block && after >= state.doc.content.size) tr = tr.insert(after, state.schema.nodes.paragraph.create())
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(after), 1))
    } else tr = tr.setSelection(TextSelection.near(tr.doc.resolve(pos), -1))
    view.dispatch(tr)
    view.focus()
  }

  const copyLatex = async () => {
    try {
      await navigator.clipboard.writeText(eng.latex())
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* presse-papiers indisponible */
    }
  }

  // ───────────── branchement des événements natifs sur le textarea invisible ─────────────
  const handlers = useRef({ commit, exit, removeSelf, copyLatex })
  handlers.current = { commit, exit, removeSelf, copyLatex }

  useEffect(() => {
    alive.current = true
    const ta = taRef.current!
    const H = () => handlers.current

    const dollar = () => {
      if (eng.isEmpty && !block) {
        const pos = getPos()
        if (pos != null) convertInlineToBlock(editor, pos, node) // `$$` → bloc centré
      } else H().exit('right') // `$` fermant, comme en LaTeX
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // touches mortes (^ sur AZERTY) et IME : on laisse la composition se terminer
      if (e.isComposing || e.key === 'Dead' || e.key === 'Process' || e.keyCode === 229) return
      e.stopPropagation()
      const mod = e.ctrlKey || e.metaKey
      if (mod && !e.altKey) {
        const k = e.key.toLowerCase()
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault()
          if (eng.undo()) H().commit()
          else editor.commands.undo()
        } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
          e.preventDefault()
          if (eng.redo()) H().commit()
          else editor.commands.redo()
        } else if (k === 'c' && ta.selectionStart === ta.selectionEnd) {
          e.preventDefault()
          void H().copyLatex()
        } else if (matchesKey(e, useSettings.getState().mathKey)) {
          e.preventDefault()
          H().exit('right')
        }
        return
      }
      if (NAV_KEYS.includes(e.key)) {
        e.preventDefault()
        if (e.key === 'Backspace' && eng.isEmpty) return H().removeSelf('left')
        const key = e.key === 'Tab' && e.shiftKey ? 'ShiftTab' : e.key
        if ((key === 'Tab' || key === 'ShiftTab') && eng.cur.path.length === 0) {
          return H().exit(key === 'Tab' ? 'right' : 'left') // jamais piégé dans la formule
        }
        const r = eng.key(key)
        H().commit()
        if (r.exit === 'left') H().exit('left')
        else if (r.exit) H().exit('right')
        return
      }
      if ([...e.key].length === 1) {
        e.preventDefault()
        if (e.key === '$') return dollar()
        eng.type(e.key)
        H().commit()
      }
    }

    // clavier système (mobile) : les caractères arrivent par beforeinput
    const onBeforeInput = (e: InputEvent) => {
      e.stopPropagation()
      if (e.isComposing) return
      if (e.inputType === 'insertText' && e.data) {
        e.preventDefault()
        if (e.data === '$') return dollar()
        eng.type(e.data)
        H().commit()
      } else if (e.inputType === 'deleteContentBackward') {
        e.preventDefault()
        if (eng.isEmpty) return H().removeSelf('left')
        eng.key('Backspace')
        H().commit()
      }
    }

    const onCompositionEnd = (e: CompositionEvent) => {
      e.stopPropagation()
      ta.value = ''
      if (e.data) {
        eng.type(e.data)
        H().commit()
      }
    }

    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const t = e.clipboardData?.getData('text/plain')
      if (t) {
        eng.type(t.replace(/\s+/g, ' '))
        H().commit()
      }
    }

    const onFocus = () => {
      setEditing(true)
      useMathActive.getState().set(true)
    }
    const onBlur = () => {
      setEditing(false)
      useMathActive.getState().set(false)
      if (!alive.current) return
      eng.key('Escape') // termine un mot en cours (ex. « RR » → ℝ)
      H().commit()
      setTimeout(() => {
        // formule restée vide : on la retire pour ne pas laisser de trou dans le texte
        if (!alive.current || !eng.isEmpty) return
        const pos = getPos()
        const cur = pos == null ? null : editor.state.doc.nodeAt(pos)
        if (pos != null && cur && cur.type === node.type && document.activeElement?.tagName !== 'TEXTAREA') {
          editor.view.dispatch(editor.state.tr.delete(pos, pos + cur.nodeSize))
        }
      }, 0)
    }

    ta.addEventListener('keydown', onKeyDown)
    ta.addEventListener('beforeinput', onBeforeInput as EventListener)
    ta.addEventListener('compositionend', onCompositionEnd)
    ta.addEventListener('paste', onPaste)
    ta.addEventListener('focus', onFocus)
    ta.addEventListener('blur', onBlur)

    // création au clavier ($) : focus immédiat
    if (pendingMath.focus) {
      pendingMath.focus = false
      if (pendingMath.seed) {
        eng.type(pendingMath.seed)
        pendingMath.seed = undefined
        queueMicrotask(() => handlers.current.commit())
      }
      ta.focus({ preventScroll: true })
      useMathActive.getState().set(true)
    }

    return () => {
      alive.current = false
      ta.removeEventListener('keydown', onKeyDown)
      ta.removeEventListener('beforeinput', onBeforeInput as EventListener)
      ta.removeEventListener('compositionend', onCompositionEnd)
      ta.removeEventListener('paste', onPaste)
      ta.removeEventListener('focus', onFocus)
      ta.removeEventListener('blur', onBlur)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // sélection de la formule par flèches / clic → le clavier passe à la formule
  useEffect(() => {
    const ta = taRef.current
    if (!selected || !ta || document.activeElement === ta) return
    ta.focus({ preventScroll: true })
    eng.key(lastNav.dir === 'right' ? 'Home' : 'End')
    lastNav.dir = null
    setRev((r) => r + 1)
  }, [selected, eng])

  return (
    <NodeViewWrapper
      as={block ? 'div' : 'span'}
      className={`qmath ${block ? 'qmath-block' : 'qmath-inline'} ${editing ? 'qmath-edit' : ''}`}
      contentEditable={false}
      data-math={block ? 'block' : 'inline'}
    >
      {editing && <span className="qbadge" aria-hidden>formule</span>}
      {!editing && eng.isEmpty ? (
        <span className="qempty">formule</span>
      ) : (
        <span className="qrender" dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {!editing && !eng.isEmpty && (
        <button
          type="button"
          className="qcopy"
          title="Copier la formule en LaTeX"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void copyLatex()}
        >
          {copied ? 'copié' : 'LaTeX'}
        </button>
      )}
      <textarea
        ref={taRef}
        className="qinput"
        aria-label="Saisie de formule au clavier"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        tabIndex={-1}
      />
    </NodeViewWrapper>
  )
}
