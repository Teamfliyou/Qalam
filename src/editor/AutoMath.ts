import { Extension, InputRule } from '@tiptap/core'
import { MathEngine } from '../engine/engine'
import { buildRules } from '../engine/rules'
import { useSettings } from '../store/settings'

/**
 * « Maths automatiques » : une expression évidente (`2**2 `, `x^2 `, `3/4 `) tapée en dehors de `$`
 * est proposée en formule dès l'Espace suivante. Retour arrière juste après annule (règle d'entrée
 * annulable de TipTap). Désactivable dans les paramètres.
 */
const OBVIOUS =
  /(?:^|\s)((?:[A-Za-z0-9.,]+(?:\*\*|\^)-?[A-Za-z0-9.]+)|(?:\d{1,3}(?:[.,]\d+)?\/\d{1,3}(?:[.,]\d+)?))\s$/

export const AutoMath = Extension.create({
  name: 'autoMath',
  addInputRules() {
    return [
      new InputRule({
        find: OBVIOUS,
        handler: ({ state, range, match }) => {
          const s = useSettings.getState()
          if (!s.autoMath) return null
          const expr = match[1]
          const e = new MathEngine(buildRules(s.shortcuts), { times: s.times })
          e.type(expr)
          if (e.isEmpty) return null
          const from = range.from + match[0].indexOf(expr)
          const math = state.schema.nodes.mathInline.create({ data: JSON.stringify(e.root) })
          state.tr.replaceWith(from, range.to, [math, state.schema.text(' ')])
          return undefined
        },
      }),
    ]
  },
})
