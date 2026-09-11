/**
 * Test 4 — bandeau de consentement, dans un vrai DOM (jsdom).
 *
 * Couvre la régression consentement.js:152 : document.querySelector() appelé
 * dans la boucle sur les iframes renvoyait le même premier substitut pour
 * tous les cadres, laissant les placeholders des vidéos 2 et 3 par-dessus les
 * vidéos activées.
 *
 * Scénarios exigés : 1, 2, 3 iframes, plusieurs fournisseurs, activation après
 * consentement, refus, modification du consentement, rechargement de page.
 *
 *   node tests/js/test-consentement.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const ICI = dirname(fileURLToPath(import.meta.url))
const SOURCE = readFileSync(
  resolve(ICI, '../../conformite/code/consentement/consentement.js'),
  'utf8'
)

let reussis = 0
const echecs = []

function verifier(nom, condition, detail = '') {
  if (condition) {
    reussis++
  } else {
    echecs.push(`${nom}${detail ? ' — ' + detail : ''}`)
  }
}

/** Monte une page, y exécute consentement.js, et rend les outils de pilotage. */
async function monterPage(html, { cookie = '' } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'https://exemple.fr/page',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const { window } = dom
  if (cookie) window.document.cookie = cookie

  // sendBeacon absent de jsdom : le journal doit rester sans effet sur le test.
  window.navigator.sendBeacon = () => true
  window.fetch = () => Promise.resolve({ ok: true })

  // location.reload() n'est pas implémenté par jsdom, et window.location n'est
  // pas remplaçable. On masque donc `location` par un paramètre de fermeture :
  // le code testé n'est pas modifié, seule sa liaison à `location` l'est.
  const compteur = { rechargements: 0 }
  window.__loc = {
    protocol: 'https:',
    hostname: 'exemple.fr',
    pathname: '/page',
    href: 'https://exemple.fr/page',
    reload() { compteur.rechargements++ },
  }
  // jsdom n'a pas fini de parser au retour du constructeur : consentement.js
  // s'accrocherait à DOMContentLoaded et le bandeau ne serait pas encore là.
  if (window.document.readyState === 'loading') {
    await new Promise((ok) => window.document.addEventListener('DOMContentLoaded', ok))
  }

  window.eval(`(function (location) {\n${SOURCE}\n})(window.__loc)`)

  const cliquer = (action) => {
    const btn = window.document.querySelector(`[data-action="${action}"]`)
    if (!btn) throw new Error(`bouton "${action}" absent du bandeau`)
    btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  }

  return {
    window,
    doc: window.document,
    cliquer,
    rechargements: () => compteur.rechargements,
    cadresActifs: () =>
      [...window.document.querySelectorAll('iframe')].filter((f) => {
        const src = f.getAttribute('src')
        return src && src !== 'about:blank'
      }),
    substitutsVisibles: () =>
      [...window.document.querySelectorAll('[data-consentement-substitut]')].filter(
        (s) => !s.hidden
      ),
  }
}

/** Construit n blocs vidéo, chacun avec son propre substitut. */
function blocsVideo(n, categorie = 'marketing') {
  return Array.from({ length: n }, (_, i) => `
    <div class="video">
      <div data-consentement-substitut="${categorie}" id="sub-${i}">
        Vidéo bloquée — acceptez les cookies pour l'afficher.
      </div>
      <iframe data-consentement="${categorie}" src="about:blank"
              data-src="https://www.youtube.com/embed/v${i}"></iframe>
    </div>`).join('')
}

/* ------------------------------------------------------------------ 4.1-4.3 */
// Le cœur de la régression : 1, 2 puis 3 iframes de la même catégorie.

for (const n of [1, 2, 3]) {
  const p = await monterPage(blocsVideo(n))
  verifier(`4.${n} avant consentement : aucun cadre actif`, p.cadresActifs().length === 0)
  verifier(
    `4.${n} avant consentement : ${n} substitut(s) visible(s)`,
    p.substitutsVisibles().length === n,
    `${p.substitutsVisibles().length} visible(s)`
  )

  p.cliquer('accepter')

  verifier(
    `4.${n} après acceptation : ${n} cadre(s) activé(s)`,
    p.cadresActifs().length === n,
    `${p.cadresActifs().length} activé(s)`
  )
  verifier(
    `4.${n} après acceptation : 0 substitut visible`,
    p.substitutsVisibles().length === 0,
    `${p.substitutsVisibles().length} substitut(s) restés visibles — c'est la régression`
  )
}

/* -------------------------------------------------------------------- 4.4 */
// Plusieurs fournisseurs et plusieurs catégories sur la même page.

{
  const p = await monterPage(`
    ${blocsVideo(2, 'marketing')}
    <div class="carte">
      <div data-consentement-substitut="marketing" id="sub-maps">Carte bloquée</div>
      <iframe data-consentement="marketing" src="about:blank"
              data-src="https://maps.google.com/embed"></iframe>
    </div>
    <div class="stats">
      <div data-consentement-substitut="mesure" id="sub-stats">Stats bloquées</div>
      <iframe data-consentement="mesure" src="about:blank"
              data-src="https://matomo.exemple.fr/embed"></iframe>
    </div>
    <script type="text/plain" data-consentement="mesure"
            data-src="https://matomo.exemple.fr/tag.js"></script>
  `)

  verifier('4.4 départ : 4 substituts visibles', p.substitutsVisibles().length === 4)
  verifier(
    '4.4 départ : script de mesure neutralisé',
    p.doc.querySelectorAll('script[type="text/plain"]').length === 1
  )

  p.cliquer('accepter')

  verifier(
    '4.4 acceptation : 4 cadres activés (3 marketing + 1 mesure)',
    p.cadresActifs().length === 4,
    `${p.cadresActifs().length} activé(s)`
  )
  verifier('4.4 acceptation : 0 substitut visible', p.substitutsVisibles().length === 0)
  verifier(
    '4.4 acceptation : script de mesure réellement exécuté',
    p.doc.querySelectorAll('script[data-consentement-actif]').length === 1
  )
}

/* -------------------------------------------------------------------- 4.5 */
// Refus : rien ne doit être activé. C'est l'exigence RGPD centrale.

{
  const p = await monterPage(`
    ${blocsVideo(3)}
    <script type="text/plain" data-consentement="mesure"
            data-src="https://exemple.fr/tag.js"></script>
  `)
  p.cliquer('refuser')

  verifier('4.5 refus : aucun cadre activé', p.cadresActifs().length === 0)
  verifier('4.5 refus : 3 substituts toujours visibles', p.substitutsVisibles().length === 3)
  verifier(
    '4.5 refus : aucun script exécuté',
    p.doc.querySelectorAll('script[data-consentement-actif]').length === 0
  )
  verifier(
    '4.5 refus : choix enregistré en cookie',
    /consentement=/.test(p.window.document.cookie)
  )
}

/* -------------------------------------------------------------------- 4.6 */
// Modification du consentement : accepter une seule catégorie.

{
  const p = await monterPage(`
    ${blocsVideo(2, 'marketing')}
    <div class="stats">
      <div data-consentement-substitut="mesure" id="sub-stats">Stats bloquées</div>
      <iframe data-consentement="mesure" src="about:blank"
              data-src="https://matomo.exemple.fr/embed"></iframe>
    </div>
  `)

  p.cliquer('personnaliser')
  const caseMesure = p.doc.querySelector('input[data-cat="mesure"]')
  const caseMarketing = p.doc.querySelector('input[data-cat="marketing"]')
  verifier('4.6 panneau détaillé : cases présentes', !!caseMesure && !!caseMarketing)
  caseMesure.checked = true
  caseMarketing.checked = false
  p.cliquer('enregistrer')

  const actifs = p.cadresActifs()
  verifier('4.6 mesure seule : 1 cadre activé', actifs.length === 1, `${actifs.length} activé(s)`)
  verifier(
    '4.6 mesure seule : c’est bien le cadre de mesure',
    actifs[0]?.getAttribute('data-consentement') === 'mesure'
  )
  verifier(
    '4.6 mesure seule : les 2 substituts marketing restent visibles',
    p.substitutsVisibles().length === 2,
    `${p.substitutsVisibles().length} visible(s)`
  )
}

/* -------------------------------------------------------------------- 4.7 */
// Rechargement : le choix déjà exprimé est réappliqué sans réafficher le bandeau.

{
  const choix = encodeURIComponent(
    JSON.stringify({
      version: 1,
      categories: { necessaire: true, mesure: false, marketing: true },
      date: new Date().toISOString(),
    })
  )
  const p = await monterPage(blocsVideo(3), { cookie: `consentement=${choix}` })

  verifier('4.7 rechargement : bandeau non réaffiché', !p.doc.querySelector('.cnst'))
  verifier(
    '4.7 rechargement : 3 cadres réactivés',
    p.cadresActifs().length === 3,
    `${p.cadresActifs().length} activé(s)`
  )
  verifier('4.7 rechargement : 0 substitut visible', p.substitutsVisibles().length === 0)
}

/* -------------------------------------------------------------------- 4.8 */
// Appariement explicite par data-substitut, dans un ordre volontairement
// inversé pour que la proximité DOM ne puisse pas donner la bonne réponse
// par accident.

{
  const p = await monterPage(`
    <div id="ph-b">substitut B</div>
    <div id="ph-a">substitut A</div>
    <iframe data-consentement="marketing" data-substitut="ph-a" src="about:blank"
            data-src="https://exemple.fr/a"></iframe>
    <iframe data-consentement="marketing" data-substitut="ph-b" src="about:blank"
            data-src="https://exemple.fr/b"></iframe>
  `)
  p.cliquer('accepter')

  verifier('4.8 appariement explicite : 2 cadres activés', p.cadresActifs().length === 2)
  verifier('4.8 appariement explicite : ph-a masqué', p.doc.getElementById('ph-a').hidden)
  verifier('4.8 appariement explicite : ph-b masqué', p.doc.getElementById('ph-b').hidden)
}

/* -------------------------------------------------------------------- 4.9 */
// Cadre sans substitut : ne doit pas lever d'erreur.

{
  let erreur = null
  try {
    const p = await monterPage(`
      <iframe data-consentement="marketing" src="about:blank"
              data-src="https://exemple.fr/seul"></iframe>
    `)
    p.cliquer('accepter')
    verifier('4.9 cadre sans substitut : activé quand même', p.cadresActifs().length === 1)
  } catch (e) {
    erreur = e
  }
  verifier('4.9 cadre sans substitut : aucune erreur levée', erreur === null, String(erreur))
}

/* ---------------------------------------------------------------- rapport */

console.log(`\n  TEST 4 — consentement : ${reussis} assertion(s) réussie(s), ${echecs.length} échec(s)`)
for (const e of echecs) console.log(`    ECHEC : ${e}`)
if (echecs.length > 0) process.exit(1)
console.log('  TEST 4 — consentement : OK\n')
