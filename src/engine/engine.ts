/**
 * Moteur de saisie mathématique : lit la frappe clavier, applique les règles de
 * transformation et maintient l'arbre de formule + la position du curseur.
 * Aucune dépendance au DOM : tout est testable avec Vitest.
 */
import {
  allEmpty, clone, isChar, isDigit, isScript, isStruct, nodeAt, rowAt,
  type Cursor, type Node, type Row, type StructNode,
} from './model'
import { BIGOPS, MATRIX_WORDS, SYSTEM_WORDS, buildRules, type Rules, type WordAction } from './rules'
import { toLatex, toPlain } from './latex'

export interface EngineOptions {
  /** Affichage de `*` : × (défaut) ou · */
  times?: 'times' | 'cdot'
}

/** Résultat d'une touche de navigation : permet à l'UI de sortir de la formule. */
export interface KeyResult {
  /** 'left' / 'right' : le curseur quitte la formule par un bord ; 'done' : Échap / Entrée. */
  exit?: 'left' | 'right' | 'done'
}

type Trigger = 'space' | 'call' | 'script' | 'other'

interface Snap {
  root: Row
  cur: Cursor
}

/** Caractères qui, tapés dans un exposant/indice « automatique », le referment d'abord. */
const BREAKERS = '+=<>,;:*/(~'
const OPERATOR_CHARS = '+-*=<>,;:(~'

export class MathEngine {
  root: Row = []
  cur: Cursor = { path: [], off: 0 }
  rules: Rules
  opts: EngineOptions

  private past: Snap[] = []
  private future: Snap[] = []
  /** Dernière conversion automatique (pour l'annuler avec Retour arrière). */
  private lastConv: { raw: Snap; after: string } | null = null
  private convRaw: Snap | null = null

  constructor(rules: Rules = buildRules(), opts: EngineOptions = {}) {
    this.rules = rules
    this.opts = opts
  }

  // ───────────────────────────── API publique ─────────────────────────────

  /** Tape du texte (un ou plusieurs caractères, comme au clavier). */
  type(text: string): void {
    for (const ch of text) this.edit(() => this.doType(ch))
  }

  /**
   * Touche de navigation / édition. Noms : ArrowLeft, ArrowRight, ArrowUp, ArrowDown,
   * Tab, ShiftTab, Enter, Escape, Backspace, Delete, Home, End.
   */
  key(k: string): KeyResult {
    if (k === 'Backspace') {
      this.backspace()
      return {}
    }
    if (k === 'Delete') {
      this.edit(() => this.deleteForward())
      return {}
    }
    // les autres touches terminent d'abord un mot en cours (ex. « RR » + → devient ℝ)
    this.edit(() => {
      this.settleUnderscore('')
      this.flush('other')
    })
    switch (k) {
      case 'ArrowRight': return this.right()
      case 'ArrowLeft': return this.left()
      case 'ArrowDown': this.vertical(+1); return {}
      case 'ArrowUp': this.vertical(-1); return {}
      case 'Tab': this.tab(+1); return {}
      case 'ShiftTab': this.tab(-1); return {}
      case 'Enter': return this.enterKey()
      case 'Escape': return { exit: 'done' }
      case 'Home': this.cur = { path: [], off: 0 }; return {}
      case 'End': this.cur = { path: [], off: this.root.length }; return {}
    }
    return {}
  }

  undo(): boolean {
    const s = this.past.pop()
    if (!s) return false
    this.future.push(this.snap())
    this.restore(s)
    this.lastConv = null
    return true
  }

  redo(): boolean {
    const s = this.future.pop()
    if (!s) return false
    this.past.push(this.snap())
    this.restore(s)
    this.lastConv = null
    return true
  }

  /** Charge un arbre existant (curseur placé à la fin) et réinitialise l'historique. */
  load(root: Row, cursorAtEnd = true): void {
    this.root = clone(root)
    this.cur = { path: [], off: cursorAtEnd ? this.root.length : 0 }
    this.past = []
    this.future = []
    this.lastConv = null
  }

  get isEmpty(): boolean {
    return this.root.length === 0
  }

  /** LaTeX « propre » (export, copie) — fractions \frac, cases vides sans symbole. */
  latex(): string {
    return toLatex(this.root, { times: this.opts.times })
  }

  /** LaTeX de la formule au repos (affichage dans la note). */
  displayLatex(): string {
    return toLatex(this.root, { times: this.opts.times, display: true })
  }

  /** LaTeX avec curseur et cases vides visibles (affichage pendant l'édition). */
  editLatex(): string {
    return toLatex(this.root, { times: this.opts.times, display: true, cursor: this.cur })
  }

  plain(): string {
    return toPlain(this.root)
  }

  /** Description textuelle de la position du curseur — utile pour les tests. */
  where(): string {
    const names: string[] = []
    let row = this.root
    for (const st of this.cur.path) {
      const n = row[st.i] as StructNode
      names.push(`${n.t}.${st.s}`)
      row = n.rows[st.s]
    }
    return `${names.length ? names.join('/') : 'root'}@${this.cur.off}`
  }

  // ─────────────────────────── Historique / édition ───────────────────────────

  private snap(): Snap {
    return { root: clone(this.root), cur: clone(this.cur) }
  }

  private restore(s: Snap) {
    this.root = clone(s.root)
    this.cur = clone(s.cur)
  }

  private key_(): string {
    return JSON.stringify([this.root, this.cur])
  }

  /** Exécute une modification en l'enregistrant dans l'historique (annulation fine). */
  private edit(fn: () => void) {
    const before = this.snap()
    const beforeKey = this.key_()
    this.convRaw = null
    fn()
    if (this.key_() === beforeKey) return
    this.past.push(before)
    if (this.convRaw) {
      // la conversion est une étape d'historique À PART : Ctrl+Z restitue la frappe brute
      this.past.push(this.convRaw)
      this.lastConv = { raw: this.convRaw, after: this.key_() }
    } else this.lastConv = null
    this.convRaw = null
    this.future = []
    if (this.past.length > 400) this.past.shift()
  }

  // ───────────────────────────── Accès au curseur ─────────────────────────────

  private get row(): Row {
    return rowAt(this.root, this.cur.path)
  }

  /** Nœud structuré qui contient le curseur (null à la racine). */
  private get node(): StructNode | null {
    return this.cur.path.length ? nodeAt(this.root, this.cur.path) : null
  }

  private get step() {
    return this.cur.path[this.cur.path.length - 1]
  }

  private insertNode(n: Node) {
    this.row.splice(this.cur.off, 0, n)
    this.cur.off++
  }

  private enter(idx: number, slot: number, atEnd = false) {
    this.cur.path.push({ i: idx, s: slot })
    this.cur.off = atEnd ? this.row.length : 0
  }

  /** Insère un nœud structuré et place le curseur dans sa case `slot`. */
  private insertStruct(n: StructNode, slot = 0) {
    const idx = this.cur.off
    this.insertNode(n)
    this.enter(idx, slot)
  }

  private exitNode() {
    const st = this.cur.path.pop()!
    this.cur.off = st.i + 1
  }

  private exitBefore() {
    const st = this.cur.path.pop()!
    this.cur.off = st.i
  }

  // ───────────────────────────── Saisie de texte ─────────────────────────────

  private doType(ch: string) {
    if (ch === '\n') return
    // racine n-ième : « sqrt3 » / « root3 »
    if (/^[1-9]$/.test(ch) && this.tryRootIndex(ch)) return
    this.settleUnderscore(ch)
    if (ch === ' ') return this.doSpace()

    const letter = /^\p{L}$/u.test(ch)
    if (!letter) {
      if (ch === '_' && this.customUnderscorePrefix()) {
        this.insertChar('_')
        return
      }
      if (ch === '(' && this.tryCall()) return
      this.flush(ch === '^' || ch === '_' ? 'script' : 'other')
    }
    this.autoExit(ch)

    switch (ch) {
      case '^': return this.script('sup')
      case '_': return this.script('sub')
      case '/': return this.slash()
      case '(': case '[': case '{': return this.open(ch)
      case ')': case ']': case '}': return this.close(ch)
      case '|': return this.pipe()
      case '*': return this.star()
      default: return this.insertChar(ch)
    }
  }

  private insertChar(ch: string) {
    this.ddxHook(ch)
    this.insertNode({ t: 'char', c: ch })
    if (!this.tryOps()) this.tryPatterns()
  }

  /** `d/dx` : les « d » de la dérivée passent en police droite. */
  private ddxHook(ch: string) {
    const n = this.node
    if (!n || n.t !== 'frac' || this.step.s !== 1 || !/^[A-Za-z]$/.test(ch)) return
    const [num, den] = n.rows
    if (num.length === 1 && den.length === 1 && isChar(num[0], /^d$/) && isChar(den[0], /^d$/)) {
      const d = (): Node => ({ t: 'sym', latex: '\\mathrm{d}', raw: 'd' })
      num[0] = d()
      den[0] = d()
    }
  }

  // ───────────────────────── Mots (grec, fonctions, ∑…) ─────────────────────────

  /** Suite de lettres / « _ » juste avant le curseur. */
  private runBefore(): { start: number; text: string } {
    const row = this.row
    let k = this.cur.off
    // une espace tapée juste avant le curseur sépare les mots : la suite de lettres est vide
    if (row[k - 1]?.sp) return { start: k, text: '' }
    while (k > 0 && isChar(row[k - 1], /^[A-Za-z_]$/)) {
      k--
      if (k > 0 && row[k - 1].sp) break
    }
    const text = row
      .slice(k, this.cur.off)
      .map((n) => (n as { c: string }).c)
      .join('')
    return { start: k, text }
  }

  /** Convertit le mot juste avant le curseur si une règle existe. Retourne true si converti. */
  private flush(trigger: Trigger): boolean {
    const { start, text } = this.runBefore()
    if (!text) return false
    const act = this.rules.words[text]
    if (!act) return false
    const ok =
      act.kind === 'sym' ||
      act.kind === 'fn' ||
      ((act.kind === 'sqrt' || act.kind === 'deco') && (trigger === 'space' || trigger === 'call')) ||
      (act.kind === 'bigop' && (trigger === 'space' || trigger === 'script'))
    if (!ok) return false
    this.applyWord(start, text, act, trigger === 'call')
    return true
  }

  private applyWord(start: number, text: string, act: WordAction, call = false) {
    this.convRaw = this.snap()
    this.row.splice(start, this.cur.off - start)
    this.cur.off = start
    switch (act.kind) {
      case 'sym':
        this.insertNode({ t: 'sym', latex: act.latex, raw: text })
        break
      case 'fn':
        this.insertNode({ t: 'fn', name: text })
        break
      case 'sqrt':
        this.insertStruct({ t: 'sqrt', rows: [[]], paren: call })
        break
      case 'deco':
        this.insertStruct({ t: 'deco', deco: act.deco, rows: [[]], paren: call })
        break
      case 'bigop':
        this.insertStruct({
          t: 'bigop',
          op: act.op,
          rows: BIGOPS[act.op].slots === 2 ? [[], []] : [[]],
        })
        break
    }
  }

  /** `sin(`, `sqrt(`, `vec(` : le mot devient un appel, « ( » est absorbée ou suit la fonction. */
  private tryCall(): boolean {
    const { start, text } = this.runBefore()
    const act = this.rules.words[text]
    if (!text || !act) return false
    if (act.kind === 'sqrt' || act.kind === 'deco') {
      this.applyWord(start, text, act, true)
      return true
    }
    return false // fn / sym : conversion normale puis parenthèse (voir flush)
  }

  /** Racine n-ième : `sqrt3` → ³√ ; le curseur passe dans le radicande. */
  private tryRootIndex(ch: string): boolean {
    const { start, text } = this.runBefore()
    if (text !== 'sqrt' && text !== 'root') return false
    this.convRaw = this.snap()
    this.row.splice(start, this.cur.off - start)
    this.cur.off = start
    this.insertStruct({ t: 'sqrt', rows: [[{ t: 'char', c: ch }], []] }, 1)
    return true
  }

  // ───────── Raccourcis personnalisés contenant « _ » (ex. mon_symbole) ─────────

  private underscoreKeys(): string[] {
    return Object.keys(this.rules.words).filter((k) => k.includes('_'))
  }

  /** Vrai si « mot_ » est le début d'un raccourci personnalisé (le « _ » reste alors littéral). */
  private customUnderscorePrefix(): boolean {
    const { text } = this.runBefore()
    if (!text) return false
    return this.underscoreKeys().some((k) => k.startsWith(text + '_'))
  }

  /** Si un « _ » littéral n'aboutit à aucun raccourci, il redevient un indice. */
  private settleUnderscore(ch: string) {
    const { start, text } = this.runBefore()
    const u = text.indexOf('_')
    if (u < 0) return
    if (/^[A-Za-z_]$/.test(ch) && this.underscoreKeys().some((k) => k.startsWith(text + ch))) return
    if (ch === ' ' && this.rules.words[text]) return
    if (ch === '' && this.rules.words[text]) return
    const subChars = this.row.slice(start + u + 1, this.cur.off)
    this.row.splice(start + u, this.cur.off - (start + u))
    this.cur.off = start + u
    const idx = this.cur.off
    this.insertNode({ t: 'sub', rows: [subChars], auto: true })
    this.enter(idx, 0, true)
  }

  // ───────────────────────────── Espace ─────────────────────────────

  private doSpace() {
    const tail = this.tailText()
    const sq = /(?:^|[^A-Za-z])(mat|pmat|bmat|vmat|Bmat|Vmat) ([1-9])$/.exec(tail)
    if (sq) return this.makeMatrix(sq[1], +sq[2], +sq[2], sq[1].length + 2)

    // « mat » / « sys » attendent leurs dimensions : l'espace est conservée provisoirement
    const { text } = this.runBefore()
    if (text in MATRIX_WORDS || SYSTEM_WORDS.includes(text)) {
      this.insertNode({ t: 'char', c: ' ' })
      return
    }
    if (this.flush('space')) return
    if (!this.spaceNav()) {
      // espace sans effet de navigation : on mémorise la frontière de mot sur le nœud précédent
      const prev = this.row[this.cur.off - 1]
      if (prev) prev.sp = true
    }
  }

  /** Espace sans mot à convertir : sort de l'exposant, du dénominateur, de la racine… */
  private spaceNav(): boolean {
    const n = this.node
    if (!n) return false
    const s = this.step.s
    const empty = this.row.length === 0
    switch (n.t) {
      case 'paren': case 'abs': case 'mat': case 'sys':
        return false
      case 'frac':
        if (empty) return false
        if (s === 0) this.nextSlot()
        else this.exitNode()
        return true
      case 'bigop':
        if (s + 1 < n.rows.length) this.nextSlot()
        else this.exitNode()
        return true
      default:
        if (n.paren || empty) return false
        this.exitNode()
        return true
    }
  }

  private nextSlot() {
    this.step.s++
    this.cur.off = 0
  }

  // ───────────────────── Structures : ^ _ / ( ) | * ─────────────────────

  /** Un exposant/indice automatique se referme quand on tape un opérateur. */
  private autoExit(ch: string) {
    for (;;) {
      const n = this.node
      if (!n || (n.t !== 'sup' && n.t !== 'sub') || !n.auto) return
      const row = this.row
      if (row.length === 0 || this.cur.off !== row.length) return
      let brk = BREAKERS.includes(ch)
      if (ch === '-') {
        const last = row[row.length - 1]
        brk = !(isChar(last) && OPERATOR_CHARS.includes(last.c)) && !(last.t === 'sym' && last.op === true)
      }
      if (/^\p{L}$/u.test(ch) && row.every(isDigit)) brk = true // x^2y → x²y
      if (!brk) return
      this.exitNode()
    }
  }

  private script(kind: 'sup' | 'sub') {
    const n = this.node
    if (n && n.t === 'bigop') {
      // sum_i=1^n : « ^ » saute à la borne haute, « _ » à la borne basse
      const st = this.step
      if (kind === 'sup' && n.rows.length > 1 && st.s === 0) {
        st.s = 1
        this.cur.off = 0
      } else if (kind === 'sub' && st.s === 1) {
        st.s = 0
        this.cur.off = 0
      }
      return
    }
    const prev = this.row[this.cur.off - 1]
    if (prev && prev.t === 'bigop' && !(kind === 'sup' && prev.rows.length < 2)) {
      this.enter(this.cur.off - 1, kind === 'sub' ? 0 : 1, true)
      return
    }
    this.insertStruct({ t: kind, rows: [[]], auto: true })
  }

  /** `**` → puissance. */
  private star() {
    const prev = this.row[this.cur.off - 1]
    if (isChar(prev, /^\*$/)) {
      this.insertNode({ t: 'char', c: '*' })
      this.convRaw = this.snap() // pour Retour arrière : on restitue « ** »
      this.row.splice(this.cur.off - 2, 2)
      this.cur.off -= 2
      this.script('sup')
      return
    }
    this.insertChar('*')
  }

  /** Début de l'opérande « collé » au curseur (nombre, variable, groupe, fonction, puissance…). */
  private operandStart(): number {
    const row = this.row
    let k = this.cur.off - 1
    if (k < 0) return this.cur.off
    while (k >= 0 && isChar(row[k], /^[!%]$/)) k-- // factorielle / pourcentage font partie de l'opérande
    while (k >= 0 && isScript(row[k])) k-- // x^2, x_n : les scripts suivent leur base
    if (k < 0) return 0
    const n = row[k]
    if (n.t === 'paren') return k > 0 && row[k - 1].t === 'fn' ? k - 1 : k
    if (isDigit(n)) {
      let s = k
      while (s > 0 && isDigit(row[s - 1])) s--
      if (s >= 2 && isChar(row[s - 1], /^[,.]$/) && isDigit(row[s - 2])) {
        s--
        while (s > 0 && isDigit(row[s - 1])) s--
      }
      return s
    }
    if (n.t === 'char') return /^\p{L}$/u.test(n.c) ? k : k + 1 // opérateur : coupe l'opérande
    return k // sym, frac, sqrt, abs, deco, fn, bigop, mat…
  }

  private slash() {
    const row = this.row
    const start = this.operandStart()
    let num = row.splice(start, this.cur.off - start)
    // (a+b)/c : les parenthèses « rondes » englobant tout le numérateur sont redondantes
    if (num.length === 1 && num[0].t === 'paren' && (num[0] as StructNode).open === '(') {
      num = (num[0] as StructNode).rows[0]
    }
    const hasNum = num.length > 0
    row.splice(start, 0, { t: 'frac', rows: [num, []] })
    this.cur.off = start
    this.enter(start, hasNum ? 1 : 0)
  }

  private open(ch: string) {
    const n = this.node
    if (ch === '(' && n && (n.t === 'sup' || n.t === 'sub') && n.auto && this.row.length === 0) {
      // x^(n+1) : groupe sans parenthèses visibles, refermé par « ) »
      n.auto = false
      n.paren = true
      return
    }
    const close = ch === '(' ? ')' : ch === '[' ? ']' : '\\}'
    this.insertStruct({ t: 'paren', rows: [[]], open: ch === '{' ? '\\{' : ch, close })
  }

  private close(ch: string) {
    const want = ch === '}' ? '\\}' : ch
    for (let d = this.cur.path.length - 1; d >= 0; d--) {
      const n = nodeAt(this.root, this.cur.path.slice(0, d + 1))
      const hit =
        n.t === 'paren'
          ? n.close === want
          : ch === ')' && !!n.paren && (n.t === 'sqrt' || n.t === 'deco' || n.t === 'sup' || n.t === 'sub')
      if (hit) {
        const i = this.cur.path[d].i
        this.cur.path = this.cur.path.slice(0, d)
        this.cur.off = i + 1
        return
      }
    }
    this.insertChar(ch)
  }

  /** `|x|` : le premier « | » ouvre une valeur absolue, le suivant la ferme. */
  private pipe() {
    for (let d = this.cur.path.length - 1; d >= 0; d--) {
      if (nodeAt(this.root, this.cur.path.slice(0, d + 1)).t === 'abs') {
        const i = this.cur.path[d].i
        this.cur.path = this.cur.path.slice(0, d)
        this.cur.off = i + 1
        return
      }
    }
    this.insertStruct({ t: 'abs', rows: [[]] })
  }

  // ───────────────────── Opérateurs symboliques & motifs ─────────────────────

  /** Si la frappe brute se termine exactement par `key`, retourne l'index de début, sinon -1. */
  private tailAlign(key: string): number {
    const row = this.row
    let rem = key.length
    let idx = this.cur.off
    while (rem > 0) {
      const n = row[idx - 1]
      if (!n || (idx < this.cur.off && n.sp)) return -1
      const raw = n.t === 'char' ? n.c : n.t === 'sym' && n.op ? n.raw : null
      if (!raw || raw.length > rem || key.slice(rem - raw.length, rem) !== raw) return -1
      rem -= raw.length
      idx--
    }
    return idx
  }

  private tryOps(): boolean {
    const keys = Object.keys(this.rules.ops).sort((a, b) => b.length - a.length)
    for (const key of keys) {
      const idx = this.tailAlign(key)
      if (idx < 0) continue
      this.convRaw = this.snap()
      this.row.splice(idx, this.cur.off - idx, { t: 'sym', latex: this.rules.ops[key], raw: key, op: true })
      this.cur.off = idx + 1
      return true
    }
    return false
  }

  /** Texte des derniers caractères bruts avant le curseur. */
  private tailText(): string {
    const row = this.row
    let s = ''
    let k = this.cur.off
    while (k > 0 && row[k - 1].t === 'char' && s.length < 16) {
      s = (row[k - 1] as { c: string }).c + s
      k--
    }
    return s
  }

  /** `mat 2x3` et `sys 3` : créés dès que les dimensions sont complètes. */
  private tryPatterns() {
    const tail = this.tailText()
    const m = /(?:^|[^A-Za-z])(mat|pmat|bmat|vmat|Bmat|Vmat) ([1-9])x([1-9])$/.exec(tail)
    if (m) return this.makeMatrix(m[1], +m[2], +m[3], m[1].length + 4)
    const s = /(?:^|[^A-Za-z])(sys|cases) ([1-9])$/.exec(tail)
    if (s) {
      this.convRaw = this.snap()
      this.removeBefore(s[1].length + 2)
      const rows: Row[] = Array.from({ length: +s[2] }, () => [])
      this.insertStruct({ t: 'sys', rows })
    }
  }

  private makeMatrix(word: string, r: number, c: number, tailLen: number) {
    this.convRaw = this.snap()
    this.removeBefore(tailLen)
    const rows: Row[] = Array.from({ length: r * c }, () => [])
    this.insertStruct({ t: 'mat', rows, r, c, delim: MATRIX_WORDS[word] })
  }

  private removeBefore(n: number) {
    this.row.splice(this.cur.off - n, n)
    this.cur.off -= n
  }

  // ───────────────────────────── Suppression ─────────────────────────────

  private backspace() {
    const lc = this.lastConv
    if (lc && lc.after === this.key_()) {
      // Retour arrière juste après une conversion automatique : on la défait
      this.edit(() => this.restore(lc.raw))
      return
    }
    this.edit(() => this.backspaceCore())
  }

  private backspaceCore() {
    const row = this.row
    const off = this.cur.off
    if (off > 0) {
      const n = row[off - 1]
      if (!isStruct(n) || allEmpty(n)) {
        row.splice(off - 1, 1)
        this.cur.off--
        return
      }
      // élément structuré non vide : on y entre par la fin
      this.enter(off - 1, n.rows.length - 1, true)
      return
    }
    if (!this.cur.path.length) return
    const st = this.step
    const n = this.node!
    const parent = rowAt(this.root, this.cur.path.slice(0, -1))
    if (n.t === 'frac') {
      // supprimer la fraction : numérateur et dénominateur redescendent dans la ligne
      const [num, den] = n.rows
      parent.splice(st.i, 1, ...num, ...den)
      this.cur.path.pop()
      this.cur.off = st.i + (st.s === 1 ? num.length : 0)
      return
    }
    if (st.s > 0) {
      st.s--
      this.cur.off = this.row.length
      return
    }
    if (allEmpty(n)) {
      parent.splice(st.i, 1)
      this.cur.path.pop()
      this.cur.off = st.i
      return
    }
    this.exitBefore()
  }

  private deleteForward() {
    const row = this.row
    const n = row[this.cur.off]
    if (!n) return
    if (!isStruct(n) || allEmpty(n)) row.splice(this.cur.off, 1)
    else this.enter(this.cur.off, 0)
  }

  // ───────────────────────────── Navigation ─────────────────────────────

  private right(): KeyResult {
    const row = this.row
    if (this.cur.off < row.length) {
      const n = row[this.cur.off]
      if (isStruct(n)) this.enter(this.cur.off, 0)
      else this.cur.off++
      return {}
    }
    const node = this.node
    if (!node) return { exit: 'right' }
    if (this.step.s + 1 < node.rows.length) this.nextSlot()
    else this.exitNode()
    return {}
  }

  private left(): KeyResult {
    if (this.cur.off > 0) {
      const n = this.row[this.cur.off - 1]
      if (isStruct(n)) this.enter(this.cur.off - 1, n.rows.length - 1, true)
      else this.cur.off--
      return {}
    }
    const node = this.node
    if (!node) return { exit: 'left' }
    const st = this.step
    if (st.s > 0) {
      st.s--
      this.cur.off = this.row.length
    } else this.exitBefore()
    return {}
  }

  private vertical(dir: 1 | -1) {
    const n = this.node
    if (!n) return
    const st = this.step
    switch (n.t) {
      case 'frac': case 'bigop':
        // bas = +1 ; frac : num(0) au-dessus de den(1) ; bigop : bas(0) sous haut(1)
        if (n.t === 'frac') this.moveSlot(st.s + dir, n)
        else this.moveSlot(st.s - dir, n)
        break
      case 'mat': {
        const c = n.c ?? 1
        this.moveSlot(st.s + dir * c, n)
        break
      }
      case 'sys':
        this.moveSlot(st.s + dir, n)
        break
      case 'sup':
        if (dir === 1) this.exitNode()
        break
      case 'sub':
        if (dir === -1) this.exitNode()
        break
    }
  }

  private moveSlot(s: number, n: StructNode) {
    if (s < 0 || s >= n.rows.length) return
    this.step.s = s
    this.cur.off = Math.min(this.cur.off, n.rows[s].length)
  }

  private tab(dir: 1 | -1) {
    const n = this.node
    if (!n) return
    const st = this.step
    if (dir === 1) {
      if (st.s + 1 < n.rows.length) this.nextSlot()
      else this.exitNode()
    } else if (st.s > 0) {
      st.s--
      this.cur.off = 0
    } else this.exitBefore()
  }

  /** Entrée : case suivante d'une matrice / d'un système ; sinon quitte la formule. */
  private enterKey(): KeyResult {
    for (let d = this.cur.path.length - 1; d >= 0; d--) {
      const n = nodeAt(this.root, this.cur.path.slice(0, d + 1))
      if (n.t === 'mat' || n.t === 'sys') {
        this.cur.path = this.cur.path.slice(0, d + 1)
        const st = this.step
        if (st.s + 1 < n.rows.length) this.nextSlot()
        else this.exitNode()
        return {}
      }
    }
    return { exit: 'done' }
  }
}
