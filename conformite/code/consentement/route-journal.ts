/**
 * Journal de preuve du consentement — app/api/consentement/route.ts
 *
 * Sans trace, un consentement ne se prouve pas ; et un consentement qui ne
 * se prouve pas est réputé absent (article 7.1 du RGPD).
 *
 * Ce journal doit rester minimal : il ne doit pas devenir lui-même un
 * traitement excessif. Pas d'identité, pas d'IP en clair, pas d'empreinte
 * de navigateur — l'IP est hachée avec un sel serveur, ce qui permet de
 * rapprocher deux enregistrements sans réidentifier la personne.
 *
 * Migration SQL en bas de fichier.
 */

import { createHash, randomUUID } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sql } from '@/lib/db' // adapter à votre client (Supabase, Prisma, Drizzle…)

export const runtime = 'nodejs'

const Corps = z.object({
  action: z.enum(['accepter', 'refuser', 'personnaliser', 'retirer']),
  categories: z.record(z.string().max(40), z.boolean()),
  version: z.number().int().min(0).max(9999),
  horodatage: z.string().datetime(),
  chemin: z.string().max(300),
}).strict()

/** IP tronquée puis hachée : rapprochable, non réidentifiable. */
function empreinteIp(ip: string | null): string | null {
  if (!ip) return null
  const sel = process.env.SEL_JOURNAL_CONSENTEMENT
  if (!sel) return null // pas de sel configuré : on préfère ne rien stocker

  // Troncature avant hachage : /24 en IPv4, /64 en IPv6.
  const tronquee = ip.includes(':')
    ? ip.split(':').slice(0, 4).join(':')
    : ip.split('.').slice(0, 3).join('.') + '.0'

  return createHash('sha256').update(sel + tronquee).digest('hex').slice(0, 32)
}

export async function POST(request: Request) {
  let donnees
  try {
    donnees = Corps.parse(await request.json())
  } catch {
    return NextResponse.json({ erreur: 'Requête invalide' }, { status: 400 })
  }

  const entetes = await headers()
  const magasin = await cookies()

  // Identifiant technique du visiteur : aléatoire, sans lien avec un compte.
  // Il sert uniquement à relier les changements d'avis successifs.
  let visiteur = magasin.get('cnst_id')?.value
  const nouveau = !visiteur
  if (!visiteur) visiteur = randomUUID()

  const ip =
    entetes.get('x-forwarded-for')?.split(',')[0].trim() ??
    entetes.get('x-real-ip') ??
    null

  try {
    await sql`
      insert into journal_consentement
        (visiteur_id, action, categories, version_bandeau,
         chemin, ip_empreinte, agent, horodatage)
      values
        (${visiteur}, ${donnees.action}, ${JSON.stringify(donnees.categories)}::jsonb,
         ${donnees.version}, ${donnees.chemin}, ${empreinteIp(ip)},
         ${entetes.get('user-agent')?.slice(0, 300) ?? null}, ${donnees.horodatage})
    `
  } catch (e) {
    // Le journal ne doit jamais empêcher le site de fonctionner : on trace
    // l'échec côté serveur et on répond 204 au navigateur.
    console.error('[consentement] échec de journalisation', e)
    return new NextResponse(null, { status: 204 })
  }

  const reponse = new NextResponse(null, { status: 204 })
  if (nouveau) {
    reponse.cookies.set('cnst_id', visiteur, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 182, // aligné sur la durée du consentement
    })
  }
  return reponse
}

/* ---------------------------------------------------------------------------

Migration :

create table journal_consentement (
  id              bigserial primary key,
  visiteur_id     uuid        not null,
  action          text        not null
                    check (action in ('accepter','refuser','personnaliser','retirer')),
  categories      jsonb       not null,
  version_bandeau integer     not null,
  chemin          text,
  ip_empreinte    text,           -- sha256(sel + ip tronquée), jamais l'IP
  agent           text,
  horodatage      timestamptz not null default now(),
  cree_le         timestamptz not null default now()
);

create index on journal_consentement (visiteur_id, horodatage desc);
create index on journal_consentement (horodatage);

-- Purge : consentement (6 mois) + 3 ans de preuve.
-- À déclarer dans code/retention/politique-retention.ts plutôt qu'ici, pour
-- que toutes les durées du projet vivent au même endroit.

Variable d'environnement à définir (secret serveur, jamais exposé) :
  SEL_JOURNAL_CONSENTEMENT="<32 octets aléatoires>"
  # openssl rand -hex 32

--------------------------------------------------------------------------- */
