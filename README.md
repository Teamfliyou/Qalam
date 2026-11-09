# Qalam — carnet de notes pour les maths, au clavier

Qalam (« قلم », le calame) est une application web de prise de notes en français où l'on écrit des
mathématiques **uniquement au clavier physique**, sans clavier virtuel et sans connaître le LaTeX :
la formule se met en forme pendant la frappe.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 77 tests (moteur de saisie, stockage, export)
npm run build    # build de production dans dist/
```

## Choix technique : moteur maison plutôt que MathLive

1. Le cahier des charges impose des règles très précises (opérande « collé » au curseur, exposant qui se referme à l'opérateur suivant, `**`, `sqrt3`, `mat 2x3`, annulation d'*une* conversion, abréviations personnalisées…) : avec MathLive il aurait fallu en contourner une bonne moitié.
2. Un moteur **sans DOM** (arbre + curseur + règles) se teste unitairement : 73 tests couvrent chaque critère de réussite, ce qui est impossible avec un web-component MathLive.
3. Le modèle est indépendant de l'UI : export LaTeX, JSON, texte de recherche et « maths automatiques » réutilisent le même code.
4. Les règles sont **déclaratives** (`src/engine/rules.ts`) et étendues à l'exécution par les raccourcis personnalisés.
5. Coût assumé : ~900 lignes de moteur ; le rendu reste délégué à KaTeX, et l'intégration TipTap tient dans un seul composant (`MathView`).

## Architecture

```
src/
  engine/            ← moteur de saisie, aucune dépendance au DOM
    model.ts         arbre de formule (Row/Node : char, sym, fn, frac, sup, sub, sqrt, paren, abs, deco, bigop, mat, sys)
    rules.ts         règles déclaratives (opérateurs, mots grecs/ensembles/fonctions, ∑ ∫ lim, décorations)
    engine.ts        MathEngine : frappe → transformations, curseur, navigation, annulation fine
    latex.ts         arbre → LaTeX (export propre, ou rendu d'édition avec curseur et cases vides)
  editor/            TipTap : nœuds formule (mathInline / mathBlock), vue React + KaTeX, maths automatiques
  db/repository.ts   interface Repository + implémentation Dexie (IndexedDB) — brancher un backend = 1 classe
  store/             Zustand : données (carnets, notes, recherche, sauvegarde auto) et réglages
  lib/               export Markdown/PDF/JSON, extraction de texte, aide-mémoire
  components/        barre latérale, dialogues (aide Ctrl+/, paramètres)
tests/               Vitest : engine.test.ts (moteur), storage.test.ts (IndexedDB + export)
```

**Modèle de données** — `Notebook { id, name, order, createdAt }` ; `Note { id, notebookId, title, content (JSON TipTap), text (recherche), createdAt, updatedAt }`.
Une formule est un nœud TipTap atomique dont l'attribut `data` est l'arbre JSON du moteur (réversible, rééditable).

**Comment le clavier arrive au moteur** — chaque formule contient un `<textarea>` invisible qui capte le clavier physique (ou le clavier système sur mobile ; touches mortes AZERTY comme `^` gérées via les événements de composition). Chaque frappe alimente `MathEngine`, dont le LaTeX est rendu par KaTeX. Aucun clavier virtuel n'existe.

## Raccourcis

(Aussi disponibles dans l'application : **Ctrl+/**.)

### Entrer / sortir des maths
| Frappe | Effet |
|---|---|
| `$` | formule en ligne (Échap, Entrée, `→` en fin de formule, ou un 2ᵉ `$` pour sortir) |
| `$$` | formule en bloc centré |
| `Ctrl+M` | formule en ligne (configurable ; transforme la sélection) |
| `2**2` puis Espace, hors `$` | « maths automatiques » (désactivable) |

### Opérateurs
| Frappe | Effet |
|---|---|
| `a/b` | fraction : l'opérande collé au curseur (nombre `12,5`, variable `x`/`x_n`, puissance `x^2`, groupe `(a+b)`, fonction `sin(x)`) devient numérateur ; `3x+2/` → seul `2` ; `(a+b)/` → numérateur `a+b` |
| `**` ou `^` | puissance ; l'exposant se referme à l'opérateur suivant (`x^2+1`) ou avec Espace / `→` ; `x^(n+1)` groupe |
| `_` | indice (`x_n`, `u_(n+1)`) |
| `*` | multiplication × (ou ·, réglage) |
| `sqrt␣` / `rac␣` | racine carrée ; `sqrt(x+1)` fonctionne aussi |
| `sqrt3` / `root3` | racine 3ᵉ puis le radicande |
| `( )` `[ ]` `{ }` | délimiteurs adaptatifs |
| `\|x\|` | valeur absolue |
| `!` `%` | factorielle, pourcentage |
| `d/dx` | dérivée (d en police droite) |

### Symboles convertis à la frappe
`<=` ≤ · `>=` ≥ · `!=` ≠ · `~=` ≈ · `+-` ± · `-+` ∓ · `->` → · `=>` ⇒ · `<=>` ⇔ · `...` … · `:=` ≔ · `===` ≡
*Retour arrière juste après* une conversion la défait (`<=` redevient `<=`) ; *Ctrl+Z* aussi, en une étape.

### Mots (conversion après Espace ou au caractère non-lettre suivant)
- Grec : `alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi chi psi omega` (+ `eps`) et `Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega`
- Ensembles de nombres : `RR NN ZZ QQ CC` → ℝ ℕ ℤ ℚ ℂ
- Logique : `in notin subset subseteq supset union inter forall exists and or not empty` → ∈ ∉ ⊂ ⊆ ⊃ ∪ ∩ ∀ ∃ ∧ ∨ ¬ ∅
- Analyse : `inf`/`infty` ∞ · `partial` ∂ · `nabla` ∇ · `times` × · `cdot` ·
- Fonctions (police droite) : `sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh ln log exp max min det gcd dim ker arg`
- Décorations : `vec(u)` `bar(x)` `hat(x)` `tilde(x)` `dot(x)`
- `sum␣` ∑ · `prod␣` ∏ · `int␣` ∫ · `oint␣` ∮ · `lim␣` : bornes éditables (bas → Tab/Espace → haut → Tab/Espace pour sortir) ; ou directement `sum_i=1^n`, `int_0^1`, `lim x->0`
- `mat 2x3` matrice (`pmat` `bmat` `vmat` `Bmat` `Vmat` pour ( ) [ ] \| \| { } ‖ ‖) · `mat 3␣` matrice carrée · `sys 3` système de 3 équations

### Navigation / édition dans une formule
| Touche | Effet |
|---|---|
| `← →` | déplacement logique (numérateur → dénominateur, base → exposant) ; aux bords de la formule on en sort |
| `↑ ↓` | numérateur ↔ dénominateur, bornes ∑, lignes de matrice |
| `Tab` / `Maj+Tab` | champ suivant / précédent (dénominateur, borne, case de matrice) ; en bout de nœud, sort du nœud |
| `Espace` ou `→` | sort de l'exposant, de l'indice, du dénominateur, de la racine |
| `Entrée` | case suivante dans une matrice/un système ; sinon quitte la formule |
| `Échap` | quitte la formule |
| `Retour arrière` | supprime caractère ou élément vide ; sur une fraction, le numérateur redescend dans la ligne ; juste après une conversion, la défait |
| `Ctrl+Z` / `Ctrl+Y` | annulation fine (une conversion automatique = une étape) |
| `Ctrl+C` | copie la formule en LaTeX (bouton « LaTeX » au survol aussi) |
| `Ctrl+/` | aide-mémoire |

Raccourcis personnalisés : **Paramètres → Mes abréviations** (ex. `mon_symbole` → `\star` ou `★`).

## Fonctionnalités

Carnets et notes (créer, renommer en double-cliquant, supprimer, glisser-déposer une note sur un carnet), recherche plein texte (formules incluses), sauvegarde automatique dans IndexedDB, éditeur riche (titres, listes, cases à cocher, gras/italique, code), export note → Markdown+LaTeX ou PDF (impression), carnet → JSON (+ import), thème clair/sombre, interface responsive (clavier système sur mobile, mêmes raccourcis).

## Limites connues

- Le PDF passe par la boîte d'impression du navigateur (« Enregistrer au format PDF »).
- Les espaces tapées dans une formule ne sont pas affichées (elles servent de séparateur de mots) : `x y` s'affiche `xy`.
- Sur mobile, un clavier à composition (prédictif) ne transmet un mot qu'à la fin de sa composition.
