import { create } from 'zustand'

/** Indicateur global : le curseur est-il dans une formule ? (affiché dans la barre d'état) */
export const useMathActive = create<{ active: boolean; set: (a: boolean) => void }>((set) => ({
  active: false,
  set: (active) => set({ active }),
}))

/**
 * Demande de focus pour la prochaine formule montée (création au clavier) :
 * `at` indique où placer le curseur dans la formule.
 */
export const pendingMath: { focus: boolean; at: 'start' | 'end'; seed?: string } = {
  focus: false,
  at: 'end',
}

/** Dernière flèche horizontale pressée dans le texte (détermine le côté d'entrée dans une formule). */
export const lastNav: { dir: 'left' | 'right' | null } = { dir: null }
