/**
 * Règles de saisie DÉCLARATIVES : pour ajouter un raccourci, ajoutez une ligne ici
 * (ou, à l'exécution, via les « raccourcis personnalisés » des paramètres).
 */

export type WordAction =
  | { kind: 'sym'; latex: string } // symbole simple
  | { kind: 'fn' } // fonction en police droite (\sin)
  | { kind: 'sqrt' } // racine carrée
  | { kind: 'bigop'; op: string } // ∑ ∏ ∫ lim
  | { kind: 'deco'; deco: string } // vec, bar, hat…

export interface Rules {
  /** Opérateurs symboliques convertis dès la dernière touche (pas besoin d'Espace). */
  ops: Record<string, string>
  /** Mots convertis après Espace (ou un autre caractère non-lettre). */
  words: Record<string, WordAction>
}

/** Opérateurs symboliques : séquence tapée → LaTeX. */
export const OPS: Record<string, string> = {
  '<=>': '\\Leftrightarrow',
  '<=': '\\le',
  '>=': '\\ge',
  '!=': '\\ne',
  '~=': '\\approx',
  '+-': '\\pm',
  '-+': '\\mp',
  '->': '\\to',
  '=>': '\\Rightarrow',
  '...': '\\ldots',
  ':=': '\\coloneqq',
  '===': '\\equiv',
}

export const GREEK_LOWER: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  epsilon: '\\varepsilon',
  eps: '\\varepsilon',
  zeta: '\\zeta',
  eta: '\\eta',
  theta: '\\theta',
  iota: '\\iota',
  kappa: '\\kappa',
  lambda: '\\lambda',
  mu: '\\mu',
  nu: '\\nu',
  xi: '\\xi',
  pi: '\\pi',
  rho: '\\rho',
  sigma: '\\sigma',
  tau: '\\tau',
  upsilon: '\\upsilon',
  phi: '\\varphi',
  chi: '\\chi',
  psi: '\\psi',
  omega: '\\omega',
}

export const GREEK_UPPER = [
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
]

export const SYMBOLS: Record<string, string> = {
  // ensembles de nombres
  RR: '\\mathbb{R}',
  NN: '\\mathbb{N}',
  ZZ: '\\mathbb{Z}',
  QQ: '\\mathbb{Q}',
  CC: '\\mathbb{C}',
  // logique / ensembles
  in: '\\in',
  notin: '\\notin',
  subset: '\\subset',
  subseteq: '\\subseteq',
  supset: '\\supset',
  union: '\\cup',
  inter: '\\cap',
  forall: '\\forall',
  exists: '\\exists',
  and: '\\wedge',
  or: '\\vee',
  not: '\\neg',
  empty: '\\varnothing',
  // analyse
  inf: '\\infty',
  infty: '\\infty',
  partial: '\\partial',
  nabla: '\\nabla',
  // divers
  times: '\\times',
  cdot: '\\cdot',
}

export const FUNCTIONS = [
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'max', 'min', 'det', 'gcd', 'dim', 'ker', 'arg',
]

export const BIGOPS: Record<string, { latex: string; slots: 1 | 2; limits: boolean }> = {
  sum: { latex: '\\sum', slots: 2, limits: true },
  prod: { latex: '\\prod', slots: 2, limits: true },
  int: { latex: '\\int', slots: 2, limits: false },
  oint: { latex: '\\oint', slots: 2, limits: false },
  lim: { latex: '\\lim', slots: 1, limits: true },
}

export const DECOS: Record<string, string> = {
  vec: '\\vec',
  bar: '\\overline',
  hat: '\\hat',
  tilde: '\\tilde',
  dot: '\\dot',
}

/** Mots qui attendent des dimensions (« mat 2x3 », « sys 3 ») : ils ne sont pas convertis seuls. */
export const MATRIX_WORDS: Record<string, string> = {
  mat: 'p',
  pmat: 'p',
  bmat: 'b',
  vmat: 'v',
  Bmat: 'B',
  Vmat: 'V',
}
export const SYSTEM_WORDS = ['sys', 'cases']

/** Raccourci personnalisé défini par l'utilisateur. */
export interface CustomShortcut {
  key: string
  /** Soit un symbole Unicode (∮), soit une commande LaTeX (\oint). */
  value: string
}

/** Construit l'ensemble de règles complet (règles de base + raccourcis personnalisés). */
export function buildRules(custom: CustomShortcut[] = []): Rules {
  const words: Record<string, WordAction> = {}
  for (const [k, v] of Object.entries(GREEK_LOWER)) words[k] = { kind: 'sym', latex: v }
  for (const k of GREEK_UPPER) words[k] = { kind: 'sym', latex: '\\' + k }
  for (const [k, v] of Object.entries(SYMBOLS)) words[k] = { kind: 'sym', latex: v }
  for (const f of FUNCTIONS) words[f] = { kind: 'fn' }
  for (const k of Object.keys(BIGOPS)) words[k] = { kind: 'bigop', op: k }
  for (const k of Object.keys(DECOS)) words[k] = { kind: 'deco', deco: k }
  words.sqrt = { kind: 'sqrt' }
  words.rac = { kind: 'sqrt' }
  for (const c of custom) {
    if (!c.key.trim() || !c.value.trim()) continue
    words[c.key.trim()] = { kind: 'sym', latex: c.value.trim() }
  }
  return { ops: { ...OPS }, words }
}
