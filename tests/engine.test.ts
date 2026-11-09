import { describe, expect, it } from 'vitest'
import { MathEngine } from '../src/engine/engine'
import { buildRules } from '../src/engine/rules'

/** Crée un moteur, tape `s`, retourne le moteur. */
function typed(s: string, e = new MathEngine()) {
  e.type(s)
  return e
}
/** LaTeX sans espaces, pour comparer simplement. */
const tex = (e: MathEngine) => e.latex().replace(/ /g, '')

describe('puissances', () => {
  it('2**2 → 2² ; le curseur est dans l’exposant ; Flèche droite en sort', () => {
    const e = typed('2**2')
    expect(tex(e)).toBe('2^{2}')
    expect(e.where()).toBe('sup.0@1')
    e.key('ArrowRight')
    expect(e.where()).toBe('root@2')
    expect(e.key('ArrowRight').exit).toBe('right')
  })
  it('2^2 donne la même chose que 2**2', () => {
    expect(tex(typed('2^2'))).toBe('2^{2}')
  })
  it('Espace sort de l’exposant', () => {
    const e = typed('x^2 ')
    expect(e.where()).toBe('root@2')
    e.type('+1')
    expect(tex(e)).toBe('x^{2}+1')
  })
  it('un opérateur referme l’exposant automatiquement', () => {
    expect(tex(typed('x^2+1'))).toBe('x^{2}+1')
    expect(tex(typed('e^-x+1'))).toBe('e^{-x}+1')
  })
  it('x^(n+1) : exposant groupé sans parenthèses visibles', () => {
    const e = typed('x^(n+1)')
    expect(tex(e)).toBe('x^{n+1}')
    expect(e.where()).toBe('root@2')
  })
  it('une lettre après un exposant numérique le referme : x^2y', () => {
    expect(tex(typed('x^2y'))).toBe('x^{2}y')
  })
})

describe('indices', () => {
  it('x_1 → x₁ ; u_n', () => {
    expect(tex(typed('x_1'))).toBe('x_{1}')
    expect(tex(typed('u_n'))).toBe('u_{n}')
  })
  it('Flèche droite sort de l’indice', () => {
    const e = typed('x_1')
    e.key('ArrowRight')
    expect(e.where()).toBe('root@2')
  })
  it('x_n**2 → x indice n, au carré', () => {
    const e = typed('x_n**2')
    expect(tex(e)).toBe('x_{n}^{2}')
    expect(e.where()).toBe('sup.0@1')
  })
})

describe('fractions', () => {
  it('3/4 → fraction, curseur dans le dénominateur', () => {
    const e = typed('3/4')
    expect(tex(e)).toBe('\\frac{3}{4}')
    expect(e.where()).toBe('frac.1@1')
  })
  it('(a+b)/c → numérateur a+b, dénominateur c', () => {
    expect(tex(typed('(a+b)/c'))).toBe('\\frac{a+b}{c}')
  })
  it('x^2+1/2 → seul 1 devient numérateur', () => {
    expect(tex(typed('x^2+1/2'))).toBe('x^{2}+\\frac{1}{2}')
  })
  it('3x+2/ → seul 2 est numérateur', () => {
    expect(tex(typed('3x+2/5'))).toBe('3x+\\frac{2}{5}')
  })
  it('nombre décimal 12,5/ → numérateur complet', () => {
    expect(tex(typed('12,5/2'))).toBe('\\frac{12{,}5}{2}')
  })
  it('x^2/3 → numérateur x²', () => {
    expect(tex(typed('x^2/3'))).toBe('\\frac{x^{2}}{3}')
  })
  it('x_n/ → numérateur x_n', () => {
    expect(tex(typed('x_n/2'))).toBe('\\frac{x_{n}}{2}')
  })
  it('sin(x)/ → numérateur sin(x)', () => {
    expect(tex(typed('sin(x)/2'))).toBe('\\frac{\\sin\\left(x\\right)}{2}')
  })
  it('Espace sort du dénominateur', () => {
    const e = typed('1/2 +3')
    expect(tex(e)).toBe('\\frac{1}{2}+3')
  })
  it('Retour arrière dans un dénominateur vide supprime la fraction et redescend le numérateur', () => {
    const e = typed('3/')
    e.key('Backspace')
    expect(tex(e)).toBe('3')
    expect(e.where()).toBe('root@1')
  })
  it('flèches : numérateur → dénominateur', () => {
    const e = typed('3/4')
    e.key('ArrowLeft') // début du dénominateur
    expect(e.where()).toBe('frac.1@0')
    e.key('ArrowLeft') // fin du numérateur
    expect(e.where()).toBe('frac.0@1')
    e.key('ArrowRight')
    expect(e.where()).toBe('frac.1@0')
  })
  it('d/dx met les d en police droite', () => {
    expect(tex(typed('d/dx'))).toBe('\\frac{\\mathrm{d}}{\\mathrm{d}x}')
  })
})

describe('racines', () => {
  it('sqrt + Espace + x+1 → racine de (x+1)', () => {
    const e = typed('sqrt x+1')
    expect(tex(e)).toBe('\\sqrt{x+1}')
    expect(e.where()).toBe('sqrt.0@3')
  })
  it('rac + Espace aussi', () => {
    expect(tex(typed('rac 2'))).toBe('\\sqrt{2}')
  })
  it('sqrt3 → racine cubique puis contenu', () => {
    const e = typed('sqrt3x')
    expect(tex(e)).toBe('\\sqrt[3]{x}')
    expect(e.where()).toBe('sqrt.1@1')
  })
  it('sqrt(…) : parenthèse absorbée, « ) » referme la racine', () => {
    const e = typed('sqrt(x+1)+2')
    expect(tex(e)).toBe('\\sqrt{x+1}+2')
  })
  it('Espace sort de la racine', () => {
    expect(tex(typed('sqrt x +1'))).toBe('\\sqrt{x}+1')
  })
})

describe('parenthèses, valeur absolue, factorielle', () => {
  it('parenthèses adaptatives', () => {
    expect(tex(typed('(a/b)'))).toBe('\\left(\\frac{a}{b}\\right)')
  })
  it('« ) » ferme à travers une fraction ouverte', () => {
    expect(tex(typed('(1/2)+3'))).toBe('\\left(\\frac{1}{2}\\right)+3')
  })
  it('|x| valeur absolue', () => {
    expect(tex(typed('|x|+|y|'))).toBe('\\left|x\\right|+\\left|y\\right|')
  })
  it('! et %', () => {
    expect(tex(typed('5!+10%'))).toBe('5!+10\\%')
  })
})

describe('opérateurs symboliques', () => {
  it.each([
    ['a<=b', 'a\\leb'],
    ['a>=b', 'a\\geb'],
    ['a!=b', 'a\\neb'],
    ['a~=b', 'a\\approxb'],
    ['a+-b', 'a\\pmb'],
    ['a->b', 'a\\tob'],
    ['a=>b', 'a\\Rightarrowb'],
    ['a<=>b', 'a\\Leftrightarrowb'],
    ['1...n', '1\\ldotsn'],
  ])('%s', (input, out) => {
    expect(tex(typed(input))).toBe(out)
  })
  it('Retour arrière juste après la conversion remet <=', () => {
    const e = typed('a<=')
    expect(tex(e)).toBe('a\\le')
    e.key('Backspace')
    expect(tex(e)).toBe('a<=')
    e.key('Backspace')
    expect(tex(e)).toBe('a<')
  })
  it('Ctrl+Z annule UNE transformation : -> redevient ->', () => {
    const e = typed('a->')
    expect(tex(e)).toBe('a\\to')
    e.undo()
    expect(tex(e)).toBe('a->')
    e.undo()
    expect(tex(e)).toBe('a-')
    e.redo()
    expect(tex(e)).toBe('a->')
    e.redo()
    expect(tex(e)).toBe('a\\to')
  })
})

describe('mots : grec, ensembles, logique, fonctions', () => {
  it('lettres grecques après Espace', () => {
    expect(tex(typed('alpha beta Delta '))).toBe('\\alpha\\beta\\Delta')
  })
  it('pi converti avant « / » (pi/2)', () => {
    expect(tex(typed('pi/2'))).toBe('\\frac{\\pi}{2}')
  })
  it('ensembles de nombres', () => {
    expect(tex(typed('x in RR '))).toBe('x\\in\\mathbb{R}')
  })
  it('un mot en fin de formule est converti à la sortie (flèche)', () => {
    const e = typed('x in RR')
    e.key('ArrowRight')
    expect(tex(e)).toBe('x\\in\\mathbb{R}')
  })
  it('logique', () => {
    expect(tex(typed('forall x exists y '))).toBe('\\forallx\\existsy')
    expect(tex(typed('A union B inter C '))).toBe('A\\cupB\\capC')
  })
  it('inf → ∞', () => {
    expect(tex(typed('x->inf '))).toBe('x\\to\\infty')
  })
  it('fonctions en police droite', () => {
    expect(tex(typed('sin x + cos(y)'))).toBe('\\sinx+\\cos\\left(y\\right)')
  })
  it('Retour arrière après alpha remet le mot', () => {
    const e = typed('alpha ')
    e.key('Backspace')
    expect(tex(e)).toBe('alpha')
  })
  it('décorations vec(u), bar(x), hat(x)', () => {
    expect(tex(typed('vec(u)+bar(x)+hat(y)'))).toBe('\\vec{u}+\\overline{x}+\\hat{y}')
  })
})

describe('sommes, intégrales, limites', () => {
  it('sum : bornes éditables au clavier (Tab / Espace)', () => {
    const e = typed('sum ')
    expect(e.where()).toBe('bigop.0@0')
    e.type('i=1')
    e.key('Tab')
    expect(e.where()).toBe('bigop.1@0')
    e.type('n')
    e.key('Tab') // sort de la somme
    e.type('i^2')
    expect(tex(e)).toBe('\\sum\\limits_{i=1}^{n}i^{2}')
  })
  it('sum_i=1^n x_i avec _ et ^', () => {
    expect(tex(typed('sum_i=1^n x_i'))).toBe('\\sum\\limits_{i=1}^{n}x_{i}')
  })
  it('int avec bornes', () => {
    expect(tex(typed('int_0^1 x'))).toBe('\\int_{0}^{1}x')
  })
  it('lim avec la limite en dessous', () => {
    const e = typed('lim x->0 ')
    expect(tex(e)).toBe('\\lim\\limits_{x\\to0}')
    e.type('sin x/x')
    expect(tex(e)).toBe('\\lim\\limits_{x\\to0}\\sin\\frac{x}{x}')
  })
  it('prod', () => {
    expect(tex(typed('prod_k=1^n k'))).toBe('\\prod\\limits_{k=1}^{n}k')
  })
})

describe('matrices et systèmes', () => {
  it('mat 2x3 crée une matrice 2×3, Tab/Entrée naviguent', () => {
    const e = typed('mat 2x3')
    expect(tex(e)).toBe('\\begin{pmatrix}&&\\\\&&\\end{pmatrix}')
    expect(e.where()).toBe('mat.0@0')
    e.type('1')
    e.key('Tab')
    e.type('2')
    e.key('Enter')
    e.type('3')
    e.key('Tab')
    e.key('Tab')
    e.key('Tab')
    e.type('6')
    expect(tex(e)).toBe('\\begin{pmatrix}1&2&3\\\\&&6\\end{pmatrix}')
    e.key('Tab') // dernière case → sort
    expect(e.where()).toBe('root@1')
  })
  it('mat 3 + Espace → matrice carrée', () => {
    const e = typed('mat 3 ')
    expect((e.root[0] as { rows: unknown[] }).rows).toHaveLength(9)
  })
  it('sys 3 crée un système de 3 équations', () => {
    const e = typed('sys 3')
    e.type('x+y=1')
    e.key('Tab')
    e.type('x-y=0')
    expect(tex(e)).toContain('\\begin{array}{l}x+y=1\\\\x-y=0\\\\\\end{array}')
    expect((e.root[0] as { rows: unknown[] }).rows).toHaveLength(3)
  })
})

describe('raccourcis personnalisés', () => {
  it('mon_symbole → symbole choisi', () => {
    const e = new MathEngine(buildRules([{ key: 'mon_symbole', value: '\\heartsuit' }]))
    e.type('mon_symbole ')
    expect(tex(e)).toBe('\\heartsuit')
  })
  it('un « _ » qui ne mène à aucun raccourci redevient un indice', () => {
    const e = new MathEngine(buildRules([{ key: 'mon_symbole', value: '\\heartsuit' }]))
    e.type('mon_x')
    expect(tex(e)).toBe('mon_{x}')
  })
  it('raccourci simple', () => {
    const e = new MathEngine(buildRules([{ key: 'oo', value: '∞' }]))
    e.type('oo ')
    expect(tex(e)).toBe('∞')
  })
})

describe('annulation / navigation / suppression', () => {
  it('Ctrl+Z / Ctrl+Y sur une fraction', () => {
    const e = typed('1/2')
    e.undo()
    expect(tex(e)).toBe('\\frac{1}{}')
    e.undo()
    expect(tex(e)).toBe('1')
    e.redo()
    e.redo()
    expect(tex(e)).toBe('\\frac{1}{2}')
  })
  it('Retour arrière supprime proprement un exposant vide', () => {
    const e = typed('x^')
    e.key('Backspace')
    expect(tex(e)).toBe('x')
    expect(e.where()).toBe('root@1')
  })
  it('Retour arrière sur un exposant rempli y entre puis efface', () => {
    const e = typed('x^2')
    e.key('ArrowRight')
    e.key('Backspace') // entre dans l'exposant
    e.key('Backspace') // efface le 2
    e.key('Backspace') // supprime l'exposant vide
    expect(tex(e)).toBe('x')
  })
  it('Maj+Tab revient au champ précédent', () => {
    const e = typed('1/2')
    e.key('ShiftTab')
    expect(e.where()).toBe('frac.0@0')
    e.key('ShiftTab')
    expect(e.where()).toBe('root@0')
  })
  it('Entrée quitte la formule', () => {
    expect(typed('x').key('Enter').exit).toBe('done')
    expect(typed('x').key('Escape').exit).toBe('done')
  })
  it('Flèche gauche / droite sortent par les bords', () => {
    const e = typed('x')
    e.key('ArrowLeft')
    expect(e.key('ArrowLeft').exit).toBe('left')
  })
  it('sérialisation JSON aller-retour', () => {
    const e = typed('x^2+1/2')
    const f = new MathEngine()
    f.load(JSON.parse(JSON.stringify(e.root)))
    expect(f.latex()).toBe(e.latex())
  })
})

describe('affichage', () => {
  it('multiplication × ou ·', () => {
    expect(tex(typed('a*b'))).toBe('a\\timesb')
    const e = new MathEngine(buildRules(), { times: 'cdot' })
    expect(tex(typed('a*b', e))).toBe('a\\cdotb')
  })
  it('le LaTeX d’édition contient curseur et case vide', () => {
    const e = typed('1/')
    expect(e.editLatex()).toContain('qcaret')
    expect(e.editLatex()).toContain('qph')
  })
})

describe('formule complète au clavier', () => {
  it('(-b ± sqrt(b**2 - 4ac)) / 2a', () => {
    const e = typed('(-b +- sqrt(b**2 - 4ac)) / 2a')
    expect(tex(e)).toBe('\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}')
  })
  it('sans espaces', () => {
    const e = typed('(-b+-sqrt(b**2-4ac))/2a')
    expect(tex(e)).toBe('\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}')
  })
  it('somme de Gauss : sum_k=1^n k = n(n+1)/2', () => {
    const e = typed('sum_k=1^n k = n(n+1)/2')
    expect(tex(e)).toBe('\\sum\\limits_{k=1}^{n}k=n\\frac{\\left(n+1\\right)}{2}'.replace('\\frac{\\left(n+1\\right)}{2}', '\\frac{n+1}{2}'))
  })
})
