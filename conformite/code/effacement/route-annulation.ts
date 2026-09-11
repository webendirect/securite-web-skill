/**
 * Rétractation d'une demande de suppression
 * — app/api/mes-donnees/annuler-suppression/route.ts
 *
 * Contrepartie indispensable de route-suppression.ts : sans elle, la « fenêtre
 * de rétractation » annoncée à la personne n'existe pas.
 *
 * Le compte étant désactivé dès la phase 1, la personne ne peut plus se
 * connecter. L'authentification se fait donc par le jeton reçu par email :
 *   - 32 octets issus d'un CSPRNG ;
 *   - stocké HACHÉ en base (une fuite de la base ne donne pas de jeton
 *     rejouable) ;
 *   - à usage unique, invalidé dès consommation ;
 *   - expirant à la fin de la fenêtre ;
 *   - comparé par hachage, donc à longueur constante.
 *
 * Après rétablissement, le mot de passe reste inchangé : la personne se
 * reconnecte normalement. Aucune session n'est ouverte par cette route — le
 * lien arrive par email, ce n'est pas une preuve d'identité suffisante pour
 * délivrer une session.
 */

import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sql } from '@/lib/db'
import { limiter } from '@/lib/ratelimit'
import { envoyerEmail } from '@/lib/mail'

export const runtime = 'nodejs'

const Corps = z.object({
  jeton: z.string().min(20).max(200),
}).strict()

export async function POST(request: Request) {
  // Le jeton est long et aléatoire, mais une route publique qui interroge la
  // base mérite une limite : elle protège aussi du martèlement.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'inconnue'
  const { success } = await limiter.limit(`annulation:${ip}`)
  if (!success) {
    return NextResponse.json(
      { erreur: 'Trop de tentatives. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': '900' } }
    )
  }

  let corps
  try {
    corps = Corps.parse(await request.json())
  } catch {
    return NextResponse.json({ erreur: 'Lien invalide' }, { status: 400 })
  }

  const jetonHash = createHash('sha256').update(corps.jeton).digest('hex')

  let email: string | null = null

  try {
    email = await sql.begin(async (tx) => {
      // Le verrou empêche deux clics simultanés de rétablir deux fois.
      const [demande] = await tx`
        select d.id, d.utilisateur_id, u.email
          from demandes_rgpd d
          join utilisateurs u on u.id = d.utilisateur_id
         where d.annulation_token_hash = ${jetonHash}
           and d.type = 'effacement'
           and d.statut in ('recue', 'en_cours')
           and d.annulation_expire_le > now()
           and u.purge_effectuee_le is null
         for update of d
      `
      if (!demande) {
        throw Object.assign(new Error('Jeton inconnu, expiré ou déjà utilisé'), {
          code: 'INVALIDE',
        })
      }

      // Rétablissement du compte : on repose exactement ce que la phase 1
      // avait posé, rien de plus. Les données n'ayant pas été détruites, il
      // n'y a rien à restaurer.
      await tx`
        update utilisateurs
           set actif = true,
               supprime_le = null,
               purge_prevue_le = null
         where id = ${demande.utilisateur_id}
      `

      // Jeton consommé : à usage unique.
      await tx`
        update demandes_rgpd
           set statut = 'annulee',
               traitee_le = now(),
               annulation_token_hash = null,
               annulation_expire_le = null,
               note = coalesce(note || ' | ', '') || 'Rétractation par la personne'
         where id = ${demande.id}
      `

      return demande.email as string
    })
  } catch (e) {
    if ((e as { code?: string }).code === 'INVALIDE') {
      // Message identique dans tous les cas d'échec : ne pas révéler si le
      // jeton a existé, s'il a expiré, ou si le compte est déjà purgé.
      return NextResponse.json(
        { erreur: 'Ce lien n’est plus valide. Contactez-nous si vous souhaitez rétablir votre compte.' },
        { status: 400 }
      )
    }
    console.error('[rgpd] échec de la rétractation', e)
    return NextResponse.json(
      { erreur: 'Le rétablissement a échoué. Aucune donnée n’a été modifiée.' },
      { status: 500 }
    )
  }

  // Notification : un rétablissement doit être visible de la personne, au cas
  // où il ne viendrait pas d'elle.
  try {
    await envoyerEmail({
      to: email,
      subject: 'Votre compte a été rétabli',
      text:
        'Votre demande de suppression a été annulée et votre compte est de nouveau actif.\n\n' +
        'Vous pouvez vous reconnecter avec votre mot de passe habituel.\n\n' +
        'Si vous n’êtes pas à l’origine de cette action, contactez-nous immédiatement : ' +
        (process.env.CONTACT_RGPD ?? 'privacy@exemple.fr'),
    })
  } catch (e) {
    console.error('[rgpd] notification de rétablissement non envoyée', e)
  }

  return NextResponse.json({
    statut: 'retabli',
    message: 'Votre compte est de nouveau actif. Vous pouvez vous reconnecter.',
  })
}
