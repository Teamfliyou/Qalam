/** Aide-mémoire des raccourcis : source unique pour la page d'aide (Ctrl+/) — recopiée dans le README. */
export interface ShortcutGroup {
  title: string
  rows: [typed: string, result: string, note?: string][]
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Entrer / sortir des maths',
    rows: [
      ['$', 'formule en ligne', 'Échap, Entrée, → en fin de formule ou un 2ᵉ $ pour sortir'],
      ['$$', 'formule en bloc centré'],
      ['Ctrl+M', 'formule en ligne (configurable)', 'transforme la sélection en formule'],
      ['2**2 puis espace (hors $)', '« maths automatiques »', 'désactivable dans les paramètres'],
    ],
  },
  {
    title: 'Opérateurs (instantanés)',
    rows: [
      ['a/b', 'fraction', 'l’opérande collé au curseur devient numérateur : (a+b)/ , x^2/ , 12,5/ , sin(x)/'],
      ['** ou ^', 'puissance', 'x^2+1 : l’exposant se referme à l’opérateur suivant'],
      ['_', 'indice', 'x_n, u_(n+1)'],
      ['*', 'multiplication ×', '· au choix dans les paramètres'],
      ['sqrt␣  ou  rac␣', 'racine carrée', 'sqrt(x+1) fonctionne aussi'],
      ['sqrt3  /  root3', 'racine n-ième (n=3)', 'puis le radicande'],
      ['( )  [ ]  { }', 'délimiteurs adaptatifs'],
      ['|x|', 'valeur absolue'],
      ['!  %', 'factorielle, pourcentage'],
      ['d/dx', 'dérivée', 'les « d » passent en police droite'],
    ],
  },
  {
    title: 'Symboles (conversion à la frappe)',
    rows: [
      ['<=  >=  !=  ~=', '≤  ≥  ≠  ≈'],
      ['+-  -+', '±  ∓'],
      ['->  =>  <=>', '→  ⇒  ⇔'],
      ['...', '…'],
      [':=  ===', '≔  ≡'],
      ['Retour arrière', 'annule la conversion', '<= redevient « <= »'],
    ],
  },
  {
    title: 'Mots (conversion après Espace)',
    rows: [
      ['alpha beta gamma delta epsilon theta lambda mu pi sigma phi omega…', 'α β γ δ ε θ λ μ π σ φ ω…'],
      ['Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega', 'Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω'],
      ['RR  NN  ZZ  QQ  CC', 'ℝ ℕ ℤ ℚ ℂ'],
      ['in  notin  subset  union  inter', '∈ ∉ ⊂ ∪ ∩'],
      ['forall  exists  and  or  not  empty', '∀ ∃ ∧ ∨ ¬ ∅'],
      ['inf  partial  nabla', '∞ ∂ ∇'],
      ['sin cos tan ln log exp max min det…', 'fonctions en police droite'],
      ['vec(u)  bar(x)  hat(x)  tilde(x)  dot(x)', 'décorations'],
    ],
  },
  {
    title: 'Sommes, intégrales, limites',
    rows: [
      ['sum␣  prod␣  int␣  oint␣', '∑ ∏ ∫ ∮ avec bornes', 'bas → Tab/Espace → haut → Tab/Espace pour sortir'],
      ['sum_i=1^n', 'bornes tapées directement', '_ = borne basse, ^ = borne haute'],
      ['lim␣', 'lim avec la limite dessous', 'lim x->0 ␣'],
    ],
  },
  {
    title: 'Matrices et systèmes',
    rows: [
      ['mat 2x3', 'matrice 2 lignes × 3 colonnes', 'pmat, bmat, vmat : ( ) [ ] | |'],
      ['mat 3␣', 'matrice carrée 3×3'],
      ['sys 3', 'système de 3 équations (accolade)'],
      ['Tab / Entrée', 'case suivante', 'dernière case : on sort de la matrice'],
    ],
  },
  {
    title: 'Navigation et édition',
    rows: [
      ['← →', 'se déplacent dans la formule', 'numérateur → dénominateur, base → exposant'],
      ['↑ ↓', 'numérateur ↔ dénominateur, lignes de matrice'],
      ['Tab / Maj+Tab', 'champ suivant / précédent'],
      ['Espace ou →', 'sort de l’exposant, indice, dénominateur, racine'],
      ['Retour arrière', 'supprime un élément vide ; sur une fraction, le numérateur redescend'],
      ['Ctrl+Z / Ctrl+Y', 'annulation fine', 'annule UNE conversion automatique'],
      ['Ctrl+C', 'copie la formule en LaTeX'],
      ['Ctrl+/', 'cette aide'],
    ],
  },
]
