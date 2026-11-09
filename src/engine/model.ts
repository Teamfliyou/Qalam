/**
 * Modèle interne d'une formule : un arbre de « lignes » (Row) contenant des nœuds.
 * Indépendant de l'UI et de KaTeX : sérialisable en JSON, exportable en LaTeX.
 */

/** Une ligne = une suite de nœuds (le contenu d'une « case » de la formule). */
export type Row = Node[]

/** Caractère brut tapé au clavier (lettre, chiffre, opérateur, ponctuation). */
export interface CharNode {
  t: 'char'
  c: string
  /** Une espace a été tapée juste après ce nœud (sépare les mots, n'est pas affichée). */
  sp?: boolean
}

/** Symbole obtenu par conversion (≤, α, ℝ, ∈…). `raw` = ce que l'utilisateur avait tapé. */
export interface SymNode {
  t: 'sym'
  latex: string
  raw: string
  /** true si issu d'un opérateur symbolique (`<=`), donc réutilisable dans une séquence (`<=>`). */
  op?: boolean
  sp?: boolean
}

/** Fonction en police droite (sin, cos, ln…). */
export interface FnNode {
  t: 'fn'
  name: string
  sp?: boolean
}

export type StructKind =
  | 'frac' // rows: [numérateur, dénominateur]
  | 'sup' // rows: [exposant]
  | 'sub' // rows: [indice]
  | 'sqrt' // rows: [radicande] ou [indice, radicande]
  | 'paren' // rows: [contenu] — parenthèses adaptatives
  | 'abs' // rows: [contenu] — valeur absolue
  | 'deco' // rows: [contenu] — vec, bar, hat…
  | 'bigop' // rows: [bas, haut] (somme, intégrale…) ou [bas] (lim)
  | 'mat' // rows: cases en ordre ligne par ligne
  | 'sys' // rows: une ligne par équation

/** Nœud structuré : possède une ou plusieurs « cases » (rows) où l'on peut placer le curseur. */
export interface StructNode {
  t: StructKind
  rows: Row[]
  /** sup/sub : créé par `^`/`_` sans parenthèse → sort tout seul à l'opérateur suivant. */
  auto?: boolean
  /** sqrt/deco/sup/sub : ouvert avec « ( » → fermé par « ) ». */
  paren?: boolean
  /** paren : délimiteurs LaTeX. */
  open?: string
  close?: string
  /** deco : vec | bar | hat | tilde | dot. */
  deco?: string
  /** bigop : sum | prod | int | oint | lim. */
  op?: string
  /** mat : dimensions et délimiteur. */
  r?: number
  c?: number
  delim?: string
  sp?: boolean
}

export type Node = CharNode | SymNode | FnNode | StructNode

/** Une étape du chemin : i = index du nœud dans la ligne, s = index de la case dans le nœud. */
export interface Step {
  i: number
  s: number
}

/** Position du curseur : chemin depuis la racine + décalage dans la ligne courante. */
export interface Cursor {
  path: Step[]
  off: number
}

export const isStruct = (n: Node | undefined): n is StructNode => !!n && 'rows' in n
export const isChar = (n: Node | undefined, re?: RegExp): n is CharNode =>
  !!n && n.t === 'char' && (!re || re.test(n.c))
export const isDigit = (n: Node | undefined): boolean => isChar(n, /^[0-9]$/)
export const isScript = (n: Node | undefined): boolean => !!n && (n.t === 'sup' || n.t === 'sub')

/** Retourne la ligne désignée par un chemin. */
export function rowAt(root: Row, path: Step[]): Row {
  let row = root
  for (const st of path) row = (row[st.i] as StructNode).rows[st.s]
  return row
}

/** Retourne le nœud désigné par le dernier pas d'un chemin non vide. */
export function nodeAt(root: Row, path: Step[]): StructNode {
  const parent = rowAt(root, path.slice(0, -1))
  return parent[path[path.length - 1].i] as StructNode
}

/** Vrai si toutes les cases d'un nœud structuré sont vides (suppression propre possible). */
export function allEmpty(n: StructNode): boolean {
  return n.rows.every((r) => r.length === 0)
}

export const clone = <T>(x: T): T => structuredClone(x)
