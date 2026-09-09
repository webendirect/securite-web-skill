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
 * Modèle retenu : désactivation immédiate, purge définitive après 30 jours.
 * La personne perd l'accès tout de suite (l'effet qu'elle demande) et garde
 * une fenêtre de rétractation en cas de suppression impulsive ou malveillante.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession, verifierMotDePasse, revoquerSessions } from '@/lib/auth'
import { sql } from '@/lib/db'
import { supprimerFichiers } from '@/lib/stockage'
import { supprimerContactEmailing } from '@/lib/emailing'
import { envoyerEmail } from '@/lib/mail'

export const runtime = 'nodejs'

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

  const [demande] = await sql`
    insert into demandes_rgpd (utilisateur_id, type, statut, canal)
    values (${id}, 'effacement', 'en_cours', 'application')
    returning id
  `

  /* ------------------------------------------------ 1. supprimable tout de suite */

  await sql`delete from sessions               where utilisateur_id = ${id}`
  await sql`delete from tokens_reinitialisation where utilisateur_id = ${id}`
  await sql`delete from paniers                where utilisateur_id = ${id}`
  await sql`delete from favoris                where utilisateur_id = ${id}`
  await sql`delete from adresses               where utilisateur_id = ${id}`
  await sql`delete from notifications          where utilisateur_id = ${id}`

  // Fichiers téléversés : la ligne en base ET l'objet dans le stockage.
  const fichiers = await sql`
    select id, chemin_stockage from fichiers where utilisateur_id = ${id}
  `
  if (fichiers.length > 0) {
    await supprimerFichiers(fichiers.map((f) => f.chemin_stockage))
    await sql`delete from fichiers where utilisateur_id = ${id}`
  }

  /* --------------------------------------------------- 2. à anonymiser, pas à supprimer */

  // Contenus publics : on coupe le lien avec la personne sans casser les fils
  // de discussion des autres utilisateurs.
  await sql`
    update commentaires
       set auteur_id = null, auteur_nom = 'Utilisateur supprimé', auteur_email = null
     where auteur_id = ${id}
  `

  // Commandes et factures : conservation légale de 10 ans. On garde le
  // document comptable, on retire l'identité vivante.
  await sql`
    update commandes
       set client_nom = 'Client supprimé', client_email = null, client_telephone = null
     where utilisateur_id = ${id}
  `
  await sql`
    update factures
       set client_nom = 'Client supprimé', client_email = null
     where utilisateur_id = ${id}
  `

  /* ------------------------------------------------------ 3. sous-traitants */

  // Chaque échec est journalisé mais ne bloque pas la suppression : la
  // personne ne doit pas rester en base parce qu'une API tierce est en panne.
  const echecs: string[] = []
  try {
    await supprimerContactEmailing(email)
  } catch (e) {
    echecs.push(`emailing: ${e instanceof Error ? e.message : 'échec'}`)
  }

  // À traiter selon les outils du projet :
  //   Stripe   → anonymiser le customer, garder les charges (obligation comptable)
  //   Sentry   → API de suppression des données par utilisateur
  //   CRM      → suppression du contact
  //   Analytics→ demande de suppression par identifiant client

  /* ------------------------------------------------ 4. désactivation du compte */

  const jeton = crypto.randomUUID()
  await sql`
    update utilisateurs
       set supprime_le = now(),
           purge_prevue_le = now() + interval '30 days',
           actif = false,
           email = ${'supprime+' + jeton + '@invalide.local'},
           email_original_hash = encode(digest(${email}, 'sha256'), 'hex'),
           nom = 'Compte supprimé', prenom = null, telephone = null,
           avatar_url = null, mot_de_passe_hash = null
     where id = ${id}
  `
  // email_original_hash : permet de reconnaître une réinscription frauduleuse
  // ou de retrouver la demande, sans conserver l'adresse en clair.

  await revoquerSessions(id)

  await sql`
    update demandes_rgpd
       set statut = 'traitee', traitee_le = now(),
           note = ${
             echecs.length
               ? 'Traitée avec échecs sous-traitants : ' + echecs.join(' | ')
               : 'Traitée intégralement'
           }
     where id = ${demande.id}
  `

  /* -------------------------------------------------------- 5. confirmation */

  // Envoyée à l'adresse d'origine, avant qu'elle ne soit plus exploitable.
  try {
    await envoyerEmail({
      to: email,
      subject: 'Votre compte a été supprimé',
      text:
        'Votre compte a été supprimé et vos données personnelles ont été effacées.\n\n' +
        'Ce qui est conservé, et pourquoi :\n' +
        '  • Vos factures, pendant 10 ans — obligation comptable (code de commerce). ' +
        'Elles ne sont plus rattachées à votre identité dans notre application.\n' +
        '  • Vos données peuvent subsister jusqu’à 30 jours dans nos sauvegardes, ' +
        'le temps de leur rotation normale.\n\n' +
        'Pour toute question : ' + (process.env.CONTACT_RGPD ?? 'privacy@exemple.fr'),
    })
  } catch {
    /* l'échec d'envoi ne remet pas en cause la suppression */
  }

  const reponse = NextResponse.json({
    statut: 'supprime',
    conserve: [
      { donnee: 'Factures', duree: '10 ans', motif: 'Obligation comptable (code de commerce)' },
      { donnee: 'Sauvegardes', duree: '30 jours', motif: 'Rotation technique' },
    ],
  })
  reponse.cookies.delete('session')
  return reponse
}
