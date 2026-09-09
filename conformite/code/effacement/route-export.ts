/**
 * Export des données personnelles — app/api/mes-donnees/export/route.ts
 *
 * Couvre le droit d'accès (art. 15) et la portabilité (art. 20) : un fichier
 * structuré, lisible par machine, contenant les données fournies par la
 * personne et celles générées par son activité.
 *
 * ATTENTION — c'est le pire endroit du site pour une faille d'autorisation :
 * une IDOR ici expose l'intégralité du dossier d'une personne. La requête ne
 * lit QUE la session ; aucun identifiant n'est accepté depuis l'URL ou le body.
 *
 * On exclut : mots de passe et hachages, jetons, notes internes, et toute
 * donnée concernant d'autres personnes (l'expéditeur d'un message reçu).
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'   // adapter
import { sql } from '@/lib/db'            // adapter
import { limiter } from '@/lib/ratelimit' // adapter

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ erreur: 'Non authentifié' }, { status: 401 })
  }

  // Un export est coûteux et sensible : 3 par jour et par compte suffisent.
  const { success } = await limiter.limit(`export:${session.user.id}`)
  if (!success) {
    return NextResponse.json(
      { erreur: 'Trop de demandes. Réessayez demain.' },
      { status: 429, headers: { 'Retry-After': '86400' } }
    )
  }

  const id = session.user.id

  // Sélection explicite des colonnes : jamais de select *, qui embarquerait
  // le hachage du mot de passe au premier changement de schéma.
  const [profil] = await sql`
    select id, email, nom, prenom, telephone, adresse, code_postal, ville, pays,
           cree_le, derniere_connexion_le, langue, newsletter
      from utilisateurs
     where id = ${id}
  `
  if (!profil) {
    return NextResponse.json({ erreur: 'Introuvable' }, { status: 404 })
  }

  const commandes = await sql`
    select id, reference, statut, total_ttc, devise, cree_le, livree_le
      from commandes where utilisateur_id = ${id} order by cree_le desc
  `

  const lignes = await sql`
    select lc.commande_id, lc.libelle, lc.quantite, lc.prix_unitaire_ttc
      from lignes_commande lc
      join commandes c on c.id = lc.commande_id
     where c.utilisateur_id = ${id}
  `

  const factures = await sql`
    select id, numero, emise_le, total_ttc, devise
      from factures where utilisateur_id = ${id} order by emise_le desc
  `

  const adresses = await sql`
    select id, libelle, ligne1, ligne2, code_postal, ville, pays, cree_le
      from adresses where utilisateur_id = ${id}
  `

  // Messages envoyés uniquement : un message reçu contient les données de
  // son expéditeur, qui ne sont pas celles du demandeur.
  const messages = await sql`
    select id, sujet, corps, cree_le
      from messages where expediteur_id = ${id} order by cree_le desc
  `

  const consentements = await sql`
    select action, categories, version_bandeau, horodatage
      from journal_consentement
     where visiteur_id = ${session.user.consentementId ?? null}
     order by horodatage desc
  `

  const fichiers = await sql`
    select id, nom_original, type_mime, taille_octets, cree_le
      from fichiers where utilisateur_id = ${id}
  `

  const donnees = {
    _meta: {
      genere_le: new Date().toISOString(),
      format: 'JSON',
      fondement: 'RGPD, articles 15 (accès) et 20 (portabilité)',
      note:
        'Cet export contient les données que vous nous avez fournies et celles ' +
        'générées par votre activité. Il exclut les données concernant d’autres ' +
        'personnes et les éléments de sécurité (mots de passe, jetons).',
      contact: process.env.CONTACT_RGPD ?? 'privacy@exemple.fr',
    },
    profil,
    adresses,
    commandes: commandes.map((c) => ({
      ...c,
      lignes: lignes.filter((l) => l.commande_id === c.id),
    })),
    factures,
    messages_envoyes: messages,
    fichiers_televerses: fichiers,
    historique_consentements: consentements,
  }

  // Journalisation de la demande : le délai légal d'un mois se prouve.
  await sql`
    insert into demandes_rgpd (utilisateur_id, type, statut, traitee_le, canal)
    values (${id}, 'acces', 'traitee', now(), 'application')
  `

  const horodatage = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(donnees, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="mes-donnees-${horodatage}.json"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    },
  })
}
