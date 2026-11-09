import { useState } from 'react'
import { Dialog } from './Dialog'
import { SHORTCUTS } from '../lib/shortcutsDoc'
import { useSettings } from '../store/settings'

/** Aide-mémoire des raccourcis (Ctrl+/). */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const custom = useSettings((s) => s.shortcuts)
  return (
    <Dialog title="Aide-mémoire des raccourcis" onClose={onClose} wide>
      <p className="mb-4 text-sm text-muted">
        Tapez comme sur une calculatrice : la formule se met en forme pendant la frappe. Aucun LaTeX à connaître.
      </p>
      <div className="space-y-6">
        {SHORTCUTS.map((g) => (
          <section key={g.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">{g.title}</h3>
            <table className="w-full text-sm">
              <tbody>
                {g.rows.map(([typed, result, note]) => (
                  <tr key={typed + result} className="border-t border-line align-top">
                    <td className="w-[38%] py-1.5 pr-3">
                      <kbd className="whitespace-pre-wrap rounded bg-line/60 px-1.5 py-0.5 font-mono text-[0.8rem]">{typed}</kbd>
                    </td>
                    <td className="py-1.5 text-ink">
                      {result}
                      {note && <span className="block text-xs text-muted">{note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        {custom.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">Vos raccourcis</h3>
            <table className="w-full text-sm">
              <tbody>
                {custom.map((c) => (
                  <tr key={c.key} className="border-t border-line">
                    <td className="w-[38%] py-1.5">
                      <kbd className="rounded bg-line/60 px-1.5 py-0.5 font-mono text-[0.8rem]">{c.key}␣</kbd>
                    </td>
                    <td className="py-1.5 font-mono text-xs text-muted">{c.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </Dialog>
  )
}

/** Paramètres : thème, multiplication, maths automatiques, raccourci Ctrl+M, abréviations perso. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  const addShortcut = () => {
    const k = key.trim()
    const v = value.trim()
    if (!k || !v || !/^[A-Za-z_]+$/.test(k)) return
    s.patch({ shortcuts: [...s.shortcuts.filter((x) => x.key !== k), { key: k, value: v }] })
    setKey('')
    setValue('')
  }

  const captureKey = (e: React.KeyboardEvent) => {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return
    e.preventDefault()
    const mods = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : ''].filter(Boolean)
    if (mods.length === 0) return
    s.patch({ mathKey: [...mods, e.key.length === 1 ? e.key.toUpperCase() : e.key].join('+') })
  }

  const row = 'flex items-center justify-between gap-4 border-t border-line py-3 text-sm first:border-t-0'
  const input = 'rounded-md border border-line bg-paper px-2 py-1 text-ink outline-none focus:border-accent'

  return (
    <Dialog title="Paramètres" onClose={onClose}>
      <div>
        <label className={row}>
          <span>Thème</span>
          <select className={input} value={s.theme} onChange={(e) => s.patch({ theme: e.target.value as 'light' | 'dark' })}>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </label>
        <label className={row}>
          <span>
            Multiplication <kbd className="font-mono text-xs text-muted">*</kbd>
          </span>
          <select className={input} value={s.times} onChange={(e) => s.patch({ times: e.target.value as 'times' | 'cdot' })}>
            <option value="times">× (croix)</option>
            <option value="cdot">· (point)</option>
          </select>
        </label>
        <label className={row}>
          <span>
            Maths automatiques
            <span className="block text-xs text-muted">Propose une formule pour 2**2 ou 3/4 tapés hors de $</span>
          </span>
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={s.autoMath} onChange={(e) => s.patch({ autoMath: e.target.checked })} />
        </label>
        <label className={row}>
          <span>
            Raccourci « formule en ligne »
            <span className="block text-xs text-muted">Cliquez puis appuyez sur la combinaison voulue</span>
          </span>
          <input readOnly className={`${input} w-32 text-center font-mono`} value={s.mathKey} onKeyDown={captureKey} />
        </label>
      </div>

      <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-accent">Mes abréviations</h3>
      <p className="mb-3 text-xs text-muted">
        Tapez l’abréviation puis Espace dans une formule. La valeur est un symbole (∮) ou une commande LaTeX (\oint). Lettres et « _ » seulement.
      </p>
      <ul className="mb-3 space-y-1">
        {s.shortcuts.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-sm">
            <kbd className="rounded bg-line/60 px-1.5 py-0.5 font-mono text-xs">{c.key}</kbd>
            <span className="text-muted">→</span>
            <span className="flex-1 truncate font-mono text-xs">{c.value}</span>
            <button className="rounded px-2 text-muted hover:bg-line/70" onClick={() => s.patch({ shortcuts: s.shortcuts.filter((x) => x.key !== c.key) })} aria-label={`Supprimer ${c.key}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className={`${input} w-40`} placeholder="abréviation" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addShortcut()} />
        <input className={`${input} min-w-0 flex-1`} placeholder="symbole ou \latex" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addShortcut()} />
        <button className="rounded-md bg-accent px-3 text-sm text-white hover:opacity-90" onClick={addShortcut}>
          Ajouter
        </button>
      </div>
    </Dialog>
  )
}
