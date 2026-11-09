import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { pendingMath } from './mathState'

/** Insère une formule vide (ou préremplie avec `seed` tapé au clavier) et lui donne le focus. */
export function insertMath(editor: Editor, kind: 'inline' | 'block', seed?: string) {
  pendingMath.focus = true
  pendingMath.at = 'end'
  pendingMath.seed = seed
  editor
    .chain()
    .focus()
    .insertContent({ type: kind === 'block' ? 'mathBlock' : 'mathInline', attrs: { data: '[]' } })
    .run()
}

/** `$$` : transforme la formule en ligne (vide) située en `pos` en bloc centré. */
export function convertInlineToBlock(editor: Editor, pos: number, node: PMNode) {
  const { state, view } = editor
  const block = state.schema.nodes.mathBlock.create({ data: node.attrs.data })
  let tr = state.tr.delete(pos, pos + node.nodeSize)
  const $f = tr.doc.resolve(pos)
  pendingMath.focus = true
  pendingMath.at = 'end'
  let start: number
  if ($f.parent.type.name === 'paragraph' && $f.parent.content.size === 0) {
    start = $f.before()
    tr = tr.replaceWith(start, $f.after(), block)
  } else {
    start = $f.after()
    tr = tr.insert(start, block)
  }
  // un paragraphe doit toujours suivre un bloc final, pour pouvoir continuer à écrire
  if (start + block.nodeSize >= tr.doc.content.size) {
    tr = tr.insert(start + block.nodeSize, state.schema.nodes.paragraph.create())
  }
  view.dispatch(tr.scrollIntoView())
}
