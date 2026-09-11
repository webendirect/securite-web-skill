/**
 * Suppression de compte — app/api/mes-donnees/supprimer/route.ts
 *
 * Droit à l'effacement (art. 17). Ce droit n'est PAS absolu : il cède devant
 * une obligation légale de conservation. On supprime donc tout ce qui peut
 * l'être, on anonymise le reste, et on explique à la personne ce qui est
 * conservé, pourquoi et pour combien de temps.
 *
 * Erreur classique des implémentations générées : un delete cascade qui
 * emporte les factures — non-conformité comptable, et données irrécupérables.
 *
 * ---------------------------------------------------------------------------
 * MODÈLE EN DEUX PHASES
 *
 * Phase 1 — ICI, immédiate et transactionnelle.
 *   Les ACCÈS sont coupés : sessions révoquées, jetons détruits, compte
 *   désactivé, désinscription des envois. Aucune donnée personnelle n'est
 *   encore détruite. La personne perd tout de suite l'usage du compte, ce qui
 *   est l'effet qu'elle demande, et le traitement cesse.
 *
 * Phase 2 — différée, dans purger_comptes_supprimes() (migration-demandes.sql).
 *   À l'échéance de `purge_prevue_le`, les données sont réellement détruites
 *   ou anonymisées, en une seule transaction PL/pgSQL.
 *
 * Entre les deux : la fenêtre de rétractation, réelle — le compte est rétabli
 * par route-annulation.ts. La version précédente de ce fichier annonçait cette
 * fenêtre tout en détruisant immédiatement adresses, favoris, paniers,
 * notifications, fichiers et hash du mot de passe : il n'y avait rien à
 * rétracter.
 *
 * FENETRE_JOURS est un CHOIX MÉTIER, pas une durée légale. Le RGPD impose un
 * effacement « dans les meilleurs délais » sans fixer de chiffre.
 * [VÉRIFICATION JURIDIQUE NÉCESSAIRE] avant de retenir une valeur élevée :
 * plus la fenêtre est longue, plus il faut pouvoir démontrer que le traitement
 * a bien cessé pendant celle-ci.
 */

import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, verifierMotDePasse, revoquerSessions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { supprimerContactEmailing } from '@/lib/emailing'
import { envoyerEmail } from '@/lib/mail'

export const runtime = 'nodejs'

/** Durée de la fenêtre de rétractation. Choix métier — voir l'en-tête. */
const FENETRE_JOURS = Number(process.env.RGPD_FENETRE_RETRACTATION_JOURS ?? 30)

const Corps = z.object({
  motDePasse: z.string().min(1).max(200),
  confirmation: z.literal('SUPPRIMER'),
}).strict()

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 })
  }

  let corps
  try {
    corps = Corps.parse(await request.json())
  } catch {
    return NextResponse.json({ erreur: 'Confirmation invalide' }, { status: 400 })
  }

  // Ré-authentification : une suppression ne doit jamais reposer sur un
  // simple cookie, qui peut avoir été volé ou laissé ouvert sur un poste.
  const ok = await verifierMotDePasse(session.user.id, corps.motDePasse)
  if (!ok) {
    return NextResponse.json({ erreur: 'Mot de passe incorrect' }, { status: 403 })
  }

  const id = session.user.id
  const email = session.user.email

  // Jeton de rétractation : aléatoire (CSPRNG), transmis en clair par email,
  // stocké haché. Le compte étant désactivé, la personne ne peut plus se
  // connecter : ce lien est son seul chemin de retour.
  const jetonClair = randomBytes(32).toString('base64url')
  const jetonHash = createHash('sha256').update(jetonClair).digest('hex')

  /* ====================================================================
     PHASE 1 — une seule transaction : tout passe, ou rien ne passe.
     ==================================================================== */

  let demandeId: number
  let purgePrevueLe: Date

  try {
    const resultat = await sql.begin(async (tx) => {
      // Une demande d'effacement déjà en cours ne se dédouble pas.
      const [dejaEnCours] = await tx`
        select id from demandes_rgpd
         where utilisateur_id = ${id}
           and type = 'effacement'
           and statut in ('recue', 'en_cours')
         limit 1
      `
      if (dejaEnCours) {
        throw Object.assign(new Error('Demande déjà en cours'), { code: 'DEJA_EN_COURS' })
      }

      const [demande] = await tx`
        insert into demandes_rgpd
          (utilisateur_id, type, statut, canal, identite_verifiee_par,
           annulation_token_hash, annulation_expire_le)
        values
          (${id}, 'effacement', 'en_cours', 'application', 'session',
           ${jetonHash}, now() + make_interval(days => ${FENETRE_JOURS}))
        returning id
      `

      // Couper les accès, tout de suite. Ce sont les seules destructions de la
      // phase 1 : elles ne détruisent aucune donnée personnelle et ne gênent
      // en rien la rétractation.
      await tx`delete from sessions                where utilisateur_id = ${id}`
      await tx`delete from tokens_reinitialisation where utilisateur_id = ${id}`

      const [u] = await tx`
        update utilisateurs
           set actif = false,
               supprime_le = now(),
               purge_prevue_le = now() + make_interval(days => ${FENETRE_JOURS})
         where id = ${id}
           and supprime_le is null
        returning purge_prevue_le
      `
      if (!u) {
        throw Object.assign(new Error('Compte introuvable ou déjà supprimé'), {
          code: 'DEJA_SUPPRIME',
        })
      }

      return { demandeId: demande.id as number, purgePrevueLe: u.purge_prevue_le as Date }
    })

    demandeId = resultat.demandeId
    purgePrevueLe = resultat.purgePrevueLe
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'DEJA_EN_COURS' || code === 'DEJA_SUPPRIME') {
      // Demander deux fois la suppression n'est pas une erreur de la personne.
      return NextResponse.json(
        { statut: 'deja_demandee', message: 'Une suppression est déjà en cours.' },
        { status: 409 }
      )
    }
    // La transaction a été annulée : le compte est intact. On le dit clairement,
    // plutôt que de laisser croire à une suppression partielle.
    console.error('[rgpd] échec de la phase 1 de suppression', e)
    return NextResponse.json(
      { erreur: 'La suppression n’a pas pu être enregistrée. Aucune donnée n’a été modifiée.' },
      { status: 500 }
    )
  }

  /* ====================================================================
     HORS TRANSACTION — effets non transactionnels, après validation.
     Aucun de ces échecs ne remet en cause la phase 1 : ils sont journalisés
     dans la demande et repris manuellement si besoin.
     ==================================================================== */

  const echecs: string[] = []

  // Révocation côté magasin de sessions externe (Redis, Auth.js…).
  try {
    await revoquerSessions(id)
  } catch (e) {
    echecs.push(`sessions externes: ${e instanceof Error ? e.message : 'échec'}`)
  }

  // Désinscription des envois : le traitement doit cesser immédiatement, et
  // l'opération est sans risque pour la rétractation (réinscription possible).
  try {
    await supprimerContactEmailing(email)
  } catch (e) {
    echecs.push(`emailing: ${e instanceof Error ? e.message : 'échec'}`)
  }

  // Les sous-traitants dont le traitement est DESTRUCTIF se traitent en
  // phase 2 : la fenêtre de rétractation vaut aussi chez eux.
  //   Stripe    → anonymiser le customer, garder les charges (obligation comptable)
  //   Sentry    → API de suppression des données par utilisateur
  //   CRM       → suppression du contact
  //   Analytics → demande de suppression par identifiant client

  if (echecs.length > 0) {
    await sql`
      update demandes_rgpd
         set note = ${'Phase 1 — échecs sous-traitants : ' + echecs.join(' | ')}
       where id = ${demandeId}
    `.catch(() => {})
  }

  /* -------------------------------------------------------- confirmation */

  const lienAnnulation =
    `${process.env.APP_URL ?? 'https://exemple.fr'}` +
    `/mes-donnees/annuler-suppression?jeton=${jetonClair}`

  try {
    await envoyerEmail({
      to: email,
      subject: 'Votre demande de suppression de compte',
      text:
        'Votre compte a été désactivé et vos données ne sont plus utilisées.\n\n' +
        `Suppression définitive prévue le ${purgePrevueLe.toISOString().slice(0, 10)}.\n\n` +
        'Si vous changez d’avis, ce lien rétablit votre compte jusqu’à cette date :\n' +
        lienAnnulation + '\n\n' +
        'Ce qui sera conservé après la suppression définitive, et pourquoi :\n' +
        '  • Vos factures, pendant 10 ans — obligation comptable (code de commerce). ' +
        'Elles ne seront plus rattachées à votre identité dans notre application.\n' +
        '  • Vos données peuvent subsister jusqu’à 30 jours dans nos sauvegardes, ' +
        'le temps de leur rotation normale.\n\n' +
        'Pour toute question : ' + (process.env.CONTACT_RGPD ?? 'privacy@exemple.fr'),
    })
  } catch (e) {
    // L'échec d'envoi ne remet pas en cause la suppression, mais il prive la
    // personne de son chemin de rétractation : à signaler, pas à taire.
    console.error('[rgpd] envoi du mail de confirmation impossible', e)
    await sql`
      update demandes_rgpd
         set note = coalesce(note || ' | ', '') || 'Email de confirmation non envoyé'
       where id = ${demandeId}
    `.catch(() => {})
  }

  const reponse = NextResponse.json({
    statut: 'desactive',
    suppression_definitive_le: purgePrevueLe,
    retractation_possible_jusquau: purgePrevueLe,
    conserve_apres_suppression: [
      { donnee: 'Factures', duree: '10 ans', motif: 'Obligation comptable (code de commerce)' },
      { donnee: 'Sauvegardes', duree: '30 jours', motif: 'Rotation technique' },
    ],
  })
  reponse.cookies.delete('session')
  return reponse
}
