/**
 * Export du modèle de formule vers LaTeX (pour KaTeX et pour l'export).
 * En mode « édition » (cursor fourni), le LaTeX contient un curseur et des cases vides visibles.
 */
import { BIGOPS, DECOS } from './rules'
import { isScript, isStruct, type Cursor, type Node, type Row, type Step, type StructNode } from './model'

export interface LatexOptions {
  /** Multiplication affichée × (défaut) ou · */
  times?: 'times' | 'cdot'
  /** Fournir un curseur active le mode édition (caret + cases vides visibles). */
  cursor?: Cursor | null
  /** Fractions \dfrac au premier niveau (lisibilité à l'écran). Désactivé pour l'export. */
  display?: boolean
}

const CARET = '\\htmlClass{qcaret}{\\rule{0pt}{1.05em}}'
const PLACEHOLDER = '\\htmlClass{qph}{\\square}'

interface Ctx {
  o: LatexOptions
  edit: boolean
}
interface Rel {
  path: Step[]
  off: number
}

const CHAR_LATEX: Record<string, string> = {
  '*': '\\times ',
  '%': '\\%',
  '&': '\\&',
  '#': '\\#',
  $: '\\$',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '\\': '\\backslash ',
  '~': '\\sim ',
  '"': "''",
  ' ': '\\ ',
  '^': '\\hat{}',
}

/** Rend une formule en LaTeX. */
export function toLatex(root: Row, o: LatexOptions = {}): string {
  const ctx: Ctx = { o, edit: !!o.cursor }
  const rel: Rel | null = o.cursor ? { path: o.cursor.path, off: o.cursor.off } : null
  const out = renderRow(root, rel, ctx, false)
  return out.replace(/ {2,}/g, ' ').trim()
}

function renderRow(row: Row, rel: Rel | null, ctx: Ctx, small: boolean): string {
  const tokens: string[] = []
  let baseIdx = -1 // début du dernier « opérande » (pour accrocher les exposants / indices)
  const here = rel !== null && rel.path.length === 0
  for (let i = 0; i <= row.length; i++) {
    if (here && rel!.off === i) {
      const next = row[i]
      if (isScript(next) && baseIdx >= 0) {
        // le curseur est entre la base et son exposant : on le colle à la base
        const grouped = '{' + tokens.slice(baseIdx).join('') + CARET + '}'
        tokens.length = baseIdx
        tokens.push(grouped)
      } else tokens.push(CARET)
    }
    if (i === row.length) break
    const n = row[i]
    const childRel =
      rel && rel.path.length > 0 && rel.path[0].i === i
        ? { slot: rel.path[0].s, rel: { path: rel.path.slice(1), off: rel.off } }
        : null
    const tex = renderNode(n, row[i - 1], childRel, ctx, small, row[i + 1])
    if (!isScript(n)) baseIdx = tokens.length
    tokens.push(tex)
  }
  return tokens.join('')
}

/** Rend le contenu d'une case ; case vide → espace réservé (édition) ou {} (statique). */
function renderSlot(row: Row, rel: Rel | null, ctx: Ctx, small: boolean): string {
  if (row.length === 0) {
    const here = rel !== null && rel.path.length === 0
    if (ctx.edit) return (here ? CARET : '') + PLACEHOLDER
    return ''
  }
  return renderRow(row, rel, ctx, small)
}

function renderNode(
  n: Node,
  prev: Node | undefined,
  child: { slot: number; rel: Rel } | null,
  ctx: Ctx,
  small: boolean,
  next?: Node,
): string {
  const slot = (idx: number, row: Row, sm = small) =>
    renderSlot(row, child && child.slot === idx ? child.rel : null, ctx, sm)

  switch (n.t) {
    case 'char':
      return charLatex(n.c, ctx, prev, next)
    case 'sym':
      return cmd(n.latex)
    case 'fn':
      return `\\${n.name} `
    case 'frac': {
      const name = ctx.o.display && !small ? '\\dfrac' : '\\frac'
      return `${name}{${slot(0, n.rows[0], true)}}{${slot(1, n.rows[1], true)}}`
    }
    case 'sup':
      return `${prev === undefined || prev.t === 'sup' || prev.t === 'bigop' ? '{}' : ''}^{${slot(0, n.rows[0], true)}}`
    case 'sub':
      return `${prev === undefined || prev.t === 'sub' || prev.t === 'bigop' ? '{}' : ''}_{${slot(0, n.rows[0], true)}}`
    case 'sqrt': {
      if (n.rows.length === 2) return `\\sqrt[${slot(0, n.rows[0], true)}]{${slot(1, n.rows[1])}}`
      return `\\sqrt{${slot(0, n.rows[0])}}`
    }
    case 'paren':
      return `\\left${n.open ?? '('}${slot(0, n.rows[0])}\\right${n.close ?? ')'}`
    case 'abs':
      return `\\left|${slot(0, n.rows[0])}\\right|`
    case 'deco':
      return `${DECOS[n.deco ?? 'vec']}{${slot(0, n.rows[0])}}`
    case 'bigop': {
      const def = BIGOPS[n.op ?? 'sum']
      let s = def.latex + (def.limits ? '\\limits' : '')
      const parts = n.rows.map((r, i) => ({ r, i }))
      const lower = parts[0]
      const upper = parts[1]
      if (ctx.edit || lower.r.length) s += `_{${slot(0, lower.r, true)}}`
      if (upper && (ctx.edit || upper.r.length)) s += `^{${slot(1, upper.r, true)}}`
      return s + ' '
    }
    case 'mat': {
      const env = { p: 'pmatrix', b: 'bmatrix', v: 'vmatrix', B: 'Bmatrix', V: 'Vmatrix' }[n.delim ?? 'p']
      const R = n.r ?? 1
      const C = n.c ?? 1
      const lines: string[] = []
      for (let i = 0; i < R; i++) {
        const cells: string[] = []
        for (let j = 0; j < C; j++) cells.push(slot(i * C + j, n.rows[i * C + j]))
        lines.push(cells.join(' & '))
      }
      return `\\begin{${env}} ${lines.join(' \\\\ ')} \\end{${env}}`
    }
    case 'sys': {
      const lines = n.rows.map((r, i) => slot(i, r))
      return `\\left\\{\\begin{array}{l} ${lines.join(' \\\\ ')} \\end{array}\\right.`
    }
  }
}

/** Ajoute une espace après une commande se terminant par une lettre (\alpha x, pas \alphax). */
function cmd(latex: string): string {
  return /[A-Za-z]$/.test(latex) ? latex + ' ' : latex
}

function charLatex(c: string, ctx: Ctx, prev?: Node, next?: Node): string {
  if (c === '*') return ctx.o.times === 'cdot' ? '\\cdot ' : '\\times '
  if (c === ',' && prev && prev.t === 'char' && /[0-9]/.test(prev.c) && next && next.t === 'char' && /[0-9]/.test(next.c))
    return '{,}' // virgule décimale : pas d'espace après
  return CHAR_LATEX[c] ?? c
}

/** Texte brut approximatif d'une formule (recherche plein texte). */
export function toPlain(row: Row): string {
  return row
    .map((n): string => {
      if (n.t === 'char') return n.c
      if (n.t === 'sym') return n.raw
      if (n.t === 'fn') return n.name
      if (isStruct(n)) {
        const parts = n.rows.map(toPlain)
        if (n.t === 'frac') return `(${parts[0]})/(${parts[1]})`
        if (n.t === 'sup') return `^(${parts[0]})`
        if (n.t === 'sub') return `_(${parts[0]})`
        if (n.t === 'sqrt') return `sqrt(${parts[parts.length - 1]})`
        return `${n.op ?? n.deco ?? ''}(${parts.join(',')})`
      }
      return ''
    })
    .join('')
}

export type { StructNode }
