/**
 * ConsentementProvider — version React / Next.js App Router.
 *
 * Monte le bandeau et expose l'état du consentement au reste de l'application.
 * La logique de blocage reste la même : les scripts tiers ne sont montés
 * qu'après consentement de leur catégorie, via <ScriptConsenti>.
 *
 * app/layout.tsx :
 *   import { ConsentementProvider } from '@/components/ConsentementProvider'
 *   <body>
 *     <ConsentementProvider>{children}</ConsentementProvider>
 *   </body>
 *
 * Ailleurs :
 *   const { aConsenti, ouvrir } = useConsentement()
 */
'use client'

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react'
import Script from 'next/script'

/* ------------------------------------------------------------------ types */

export type Categorie = 'necessaire' | 'mesure' | 'marketing'
export type EtatConsentement = Record<Categorie, boolean>

type Contexte = {
  etat: EtatConsentement
  choixExprime: boolean
  aConsenti: (c: Categorie) => boolean
  ouvrir: () => void
  enregistrer: (e: Partial<EtatConsentement>, action: Action) => void
}

type Action = 'accepter' | 'refuser' | 'personnaliser' | 'retirer'

/* ------------------------------------------------------------- constantes */

// Incrémenter à chaque changement de finalités : les consentements
// antérieurs sont alors redemandés.
const VERSION = 1
const NOM_COOKIE = 'consentement'
const DUREE_JOURS = 182 // ~6 mois
const URL_JOURNAL = '/api/consentement'

const COOKIES_PAR_CATEGORIE: Record<string, string[]> = {
  mesure: ['_ga', '_gid', '_gat', '_hj', '_pk_'],
  marketing: ['_fbp', '_fbc', 'IDE', '_gcl_', 'test_cookie'],
}

const CATEGORIES: { cle: Categorie; titre: string; texte: string; obligatoire: boolean }[] = [
  {
    cle: 'necessaire',
    titre: 'Strictement nécessaires',
    texte: 'Indispensables au fonctionnement : connexion, panier, sécurité, mémorisation de votre choix.',
    obligatoire: true,
  },
  {
    cle: 'mesure',
    titre: 'Mesure d’audience',
    texte: 'Nous aident à comprendre comment le site est utilisé. Les statistiques produites sont globales.',
    obligatoire: false,
  },
  {
    cle: 'marketing',
    titre: 'Contenus et publicité',
    texte: 'Affichage de vidéos et de contenus externes, mesure de nos campagnes.',
    obligatoire: false,
  },
]

const DEFAUT: EtatConsentement = { necessaire: true, mesure: false, marketing: false }

/* --------------------------------------------------------------- cookies */

function lireCookie(nom: string): string | null {
  if (typeof document === 'undefined') return null
  const found = document.cookie
    .split('; ')
    .find((c) => decodeURIComponent(c.split('=')[0]) === nom)
  return found ? decodeURIComponent(found.split('=').slice(1).join('=')) : null
}

function ecrireCookie(nom: string, valeur: string, jours: number) {
  const exp = new Date(Date.now() + jours * 864e5).toUTCString()
  const securise = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    `${encodeURIComponent(nom)}=${encodeURIComponent(valeur)}` +
    `; Expires=${exp}; Path=/; SameSite=Lax${securise}`
}

function effacerCookiesDe(categorie: string) {
  const prefixes = COOKIES_PAR_CATEGORIE[categorie] ?? []
  const hote = location.hostname
  const domaines = ['', hote, `.${hote}`]
  document.cookie.split('; ').forEach((brut) => {
    const nom = decodeURIComponent(brut.split('=')[0])
    if (!prefixes.some((p) => nom.startsWith(p))) return
    domaines.forEach((d) => {
      document.cookie =
        `${encodeURIComponent(nom)}=; Expires=Thu, 01 Jan 1970 00:00:01 GMT; Path=/` +
        (d ? `; Domain=${d}` : '')
    })
  })
}

function lireChoix(): EtatConsentement | null {
  const brut = lireCookie(NOM_COOKIE)
  if (!brut) return null
  try {
    const d = JSON.parse(brut)
    return d.version === VERSION ? (d.categories as EtatConsentement) : null
  } catch {
    return null
  }
}

/* --------------------------------------------------------------- contexte */

const ConsentementContexte = createContext<Contexte | null>(null)

export function useConsentement(): Contexte {
  const ctx = useContext(ConsentementContexte)
  if (!ctx) throw new Error('useConsentement doit être utilisé dans ConsentementProvider')
  return ctx
}

/* --------------------------------------------------------------- provider */

export function ConsentementProvider({ children }: { children: React.ReactNode }) {
  const [etat, setEtat] = useState<EtatConsentement>(DEFAUT)
  const [choixExprime, setChoixExprime] = useState(true) // évite un flash au montage
  const [ouvert, setOuvert] = useState(false)
  const [detaille, setDetaille] = useState(false)

  // Lecture du cookie côté client uniquement : le rendu serveur ne connaît
  // pas le choix, donc on n'affiche rien avant l'hydratation.
  useEffect(() => {
    const choix = lireChoix()
    if (choix) {
      setEtat(choix)
      setChoixExprime(true)
    } else {
      setChoixExprime(false)
      setOuvert(true)
    }
  }, [])

  const journaliser = useCallback((suivant: EtatConsentement, action: Action) => {
    try {
      const charge = JSON.stringify({
        action,
        categories: suivant,
        version: VERSION,
        horodatage: new Date().toISOString(),
        chemin: location.pathname,
      })
      if (navigator.sendBeacon) {
        navigator.sendBeacon(URL_JOURNAL, new Blob([charge], { type: 'application/json' }))
      } else {
        void fetch(URL_JOURNAL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: charge,
          keepalive: true,
        }).catch(() => {})
      }
    } catch {
      /* la journalisation ne doit jamais casser le site */
    }
  }, [])

  const enregistrer = useCallback(
    (partiel: Partial<EtatConsentement>, action: Action) => {
      const suivant: EtatConsentement = { ...DEFAUT, ...partiel, necessaire: true }
      const retrait = (Object.keys(suivant) as Categorie[]).some(
        (c) => etat[c] && !suivant[c]
      )

      ecrireCookie(
        NOM_COOKIE,
        JSON.stringify({ version: VERSION, categories: suivant, date: new Date().toISOString() }),
        DUREE_JOURS
      )
      journaliser(suivant, action)
      ;(Object.keys(suivant) as Categorie[]).forEach((c) => {
        if (!suivant[c]) effacerCookiesDe(c)
      })

      // Google Consent Mode v2, si gtag est présent.
      const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
      gtag?.('consent', 'update', {
        analytics_storage: suivant.mesure ? 'granted' : 'denied',
        ad_storage: suivant.marketing ? 'granted' : 'denied',
        ad_user_data: suivant.marketing ? 'granted' : 'denied',
        ad_personalization: suivant.marketing ? 'granted' : 'denied',
      })

      setEtat(suivant)
      setChoixExprime(true)
      setOuvert(false)
      setDetaille(false)

      // Un script déjà exécuté ne se désactive pas : on recharge.
      if (retrait) location.reload()
    },
    [etat, journaliser]
  )

  const valeur = useMemo<Contexte>(
    () => ({
      etat,
      choixExprime,
      aConsenti: (c) => etat[c] === true,
      ouvrir: () => { setDetaille(true); setOuvert(true) },
      enregistrer,
    }),
    [etat, choixExprime, enregistrer]
  )

  return (
    <ConsentementContexte.Provider value={valeur}>
      {children}
      {ouvert && (
        <Bandeau
          etat={etat}
          detaille={detaille}
          dejaChoisi={choixExprime}
          onDetailler={() => setDetaille(true)}
          onEnregistrer={enregistrer}
        />
      )}
    </ConsentementContexte.Provider>
  )
}

/* --------------------------------------------------------------- bandeau */

function Bandeau({
  etat, detaille, dejaChoisi, onDetailler, onEnregistrer,
}: {
  etat: EtatConsentement
  detaille: boolean
  dejaChoisi: boolean
  onDetailler: () => void
  onEnregistrer: (e: Partial<EtatConsentement>, a: Action) => void
}) {
  const [brouillon, setBrouillon] = useState<EtatConsentement>(etat)

  return (
    <div className="cnst" role="dialog" aria-labelledby="cnst-titre">
      <div className="cnst-boite">
        <h2 className="cnst-titre" id="cnst-titre">Votre vie privée</h2>
        <p className="cnst-texte">
          Nous utilisons des cookies pour faire fonctionner ce site et, avec votre accord,
          pour mesurer son audience et afficher des contenus externes. Vous pouvez changer
          d’avis à tout moment.
        </p>

        {detaille && (
          <div className="cnst-cats">
            {CATEGORIES.map((c) => (
              <div className="cnst-cat" key={c.cle}>
                <label className="cnst-cat-tete">
                  <input
                    type="checkbox"
                    checked={c.obligatoire || brouillon[c.cle]}
                    disabled={c.obligatoire}
                    onChange={(e) =>
                      setBrouillon((b) => ({ ...b, [c.cle]: e.target.checked }))
                    }
                  />
                  <span className="cnst-cat-titre">{c.titre}</span>
                  {c.obligatoire && <span className="cnst-badge">toujours actif</span>}
                </label>
                <p className="cnst-cat-texte">{c.texte}</p>
              </div>
            ))}
          </div>
        )}

        <div className="cnst-actions">
          {/* Les deux boutons principaux sont identiques : exigence CNIL. */}
          <button
            type="button"
            className="cnst-btn cnst-btn-principal"
            onClick={() =>
              onEnregistrer({ mesure: false, marketing: false }, dejaChoisi ? 'retirer' : 'refuser')
            }
          >
            Tout refuser
          </button>
          <button
            type="button"
            className="cnst-btn cnst-btn-principal"
            onClick={() => onEnregistrer({ mesure: true, marketing: true }, 'accepter')}
          >
            Tout accepter
          </button>
          {detaille ? (
            <button
              type="button"
              className="cnst-btn cnst-btn-secondaire"
              onClick={() => onEnregistrer(brouillon, 'personnaliser')}
            >
              Enregistrer mes choix
            </button>
          ) : (
            <button
              type="button"
              className="cnst-btn cnst-btn-secondaire"
              onClick={onDetailler}
            >
              Personnaliser
            </button>
          )}
        </div>

        <p className="cnst-liens">
          <a href="/politique-de-confidentialite">Politique de confidentialité</a>
          <a href="/mentions-legales">Mentions légales</a>
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------- scripts sous consentement */

/**
 * Ne monte le script qu'après consentement de sa catégorie.
 *
 *   <ScriptConsenti categorie="mesure"
 *                   src="https://www.googletagmanager.com/gtag/js?id=G-XXX" />
 */
export function ScriptConsenti({
  categorie, src, id, strategy = 'afterInteractive',
}: {
  categorie: Categorie
  src: string
  id?: string
  strategy?: 'afterInteractive' | 'lazyOnload'
}) {
  const { aConsenti } = useConsentement()
  if (!aConsenti(categorie)) return null
  return <Script src={src} id={id} strategy={strategy} />
}

/**
 * Contenu externe (vidéo, carte) remplacé par une invitation tant que la
 * catégorie n'est pas consentie — meilleure expérience qu'un cadre vide.
 */
export function CadreConsenti({
  categorie, src, titre, ...props
}: {
  categorie: Categorie
  src: string
  titre: string
} & React.IframeHTMLAttributes<HTMLIFrameElement>) {
  const { aConsenti, ouvrir } = useConsentement()

  if (!aConsenti(categorie)) {
    return (
      <div data-consentement-substitut={categorie}>
        <p>Ce contenu externe dépose des cookies. Il ne s’affiche qu’avec votre accord.</p>
        <button type="button" className="cnst-btn cnst-btn-principal" onClick={ouvrir}>
          Autoriser et afficher
        </button>
      </div>
    )
  }
  return <iframe src={src} title={titre} {...props} />
}
