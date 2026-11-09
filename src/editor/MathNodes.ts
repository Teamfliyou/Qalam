import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { MathView } from './MathView'

/**
 * Nœuds « formule » : atomes dont l'attribut `data` contient l'arbre du moteur de saisie (JSON).
 * L'édition est entièrement gérée par la vue (MathView) qui pilote un MathEngine.
 */
const dataAttr = {
  data: {
    default: '[]',
    parseHTML: (el: HTMLElement) => el.getAttribute('data-tree') ?? '[]',
    renderHTML: (attrs: Record<string, unknown>) => ({ 'data-tree': attrs.data as string }),
  },
}

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => dataAttr,
  parseHTML: () => [{ tag: 'span[data-math-inline]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes({ 'data-math-inline': '' }, HTMLAttributes)],
  addNodeView: () => ReactNodeViewRenderer(MathView, { as: 'span' } as never),
})

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => dataAttr,
  parseHTML: () => [{ tag: 'div[data-math-block]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes({ 'data-math-block': '' }, HTMLAttributes)],
  addNodeView: () => ReactNodeViewRenderer(MathView),
})
