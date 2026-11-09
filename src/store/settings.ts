import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CustomShortcut } from '../engine/rules'

export interface Settings {
  theme: 'light' | 'dark'
  /** Affichage de `*` */
  times: 'times' | 'cdot'
  /** Détecter `2**2`, `3/4`… hors `$` et proposer une formule */
  autoMath: boolean
  /** Raccourci d'entrée en mode maths, ex. « Ctrl+M » */
  mathKey: string
  /** Abréviations personnalisées */
  shortcuts: CustomShortcut[]
}

interface SettingsStore extends Settings {
  patch: (p: Partial<Settings>) => void
}

const prefersDark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      theme: prefersDark ? 'dark' : 'light',
      times: 'times',
      autoMath: true,
      mathKey: 'Ctrl+M',
      shortcuts: [{ key: 'mon_symbole', value: '\\star' }],
      patch: (p) => set(p),
    }),
    { name: 'qalam-settings' },
  ),
)

/** Vrai si l'événement clavier correspond à un raccourci « Ctrl+Maj+K ». */
export function matchesKey(e: KeyboardEvent, spec: string): boolean {
  const parts = spec.split('+').map((p) => p.trim().toLowerCase())
  const key = parts[parts.length - 1]
  const mods = new Set(parts.slice(0, -1))
  const ctrl = mods.has('ctrl') || mods.has('cmd') || mods.has('mod') || mods.has('meta')
  return (
    e.key.toLowerCase() === key &&
    (e.ctrlKey || e.metaKey) === ctrl &&
    e.shiftKey === mods.has('shift') &&
    e.altKey === mods.has('alt')
  )
}
