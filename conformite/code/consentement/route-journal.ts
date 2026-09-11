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
import { limiter } from '@/lib/ratelimit' // adapter

export const runtime = 'nodejs'

const Corps = z.object({
  action: z.enum(['accepter', 'refuser', 'personnaliser', 'retirer']),
  // Nombre de catégories borné : sans plafond, un client hostile fait grossir
  // indéfiniment le JSONB stocké.
  categories: z
    .record(z.string().max(40), z.boolean())
    .refine((c) => Object.keys(c).length <= 20, 'trop de catégories'),
  version: z.number().int().min(0).max(9999),
  horodatage: z.string().datetime(),
  // Un chemin relatif, pas une URL absolue : on ne stocke pas de domaine tiers
  // et on ne laisse pas écrire n'importe quoi dans le journal.
  chemin: z.string().max(300).regex(/^\/[^\s]*$/, 'chemin relatif attendu'),
}).strict()

const SEL = process.env.SEL_JOURNAL_CONSENTEMENT

/** Hachage salé, utilisé pour tout ce qui dérive d'une IP. */
function hacher(valeur: string): string {
  return createHash('sha256').update((SEL ?? '') + valeur).digest('hex').slice(0, 32)
}

/**
 * IP tronquée puis hachée pour le JOURNAL : rapprochable, non réidentifiable.
 * La troncature (/24 en IPv4, /64 en IPv6) est ce qui empêche de remonter à un
 * abonné précis ; le sel est ce qui empêche de tester les 2^32 adresses.
 */
function empreinteIp(ip: string | null): string | null {
  if (!ip) return null
  if (!SEL) return null // pas de sel configuré : on préfère ne rien stocker

  const tronquee = ip.includes(':')
    ? ip.split(':').slice(0, 4).join(':')
    : ip.split('.').slice(0, 3).join('.') + '.0'

  return hacher(tronquee)
}

export async function POST(request: Request) {
  // Route publique qui écrit en base : sans limite, c'est un moyen gratuit de
  // faire grossir la table. La limite est large — un visiteur légitime change
  // d'avis quelques fois, pas cent.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'inconnue'

  // La clé de limitation porte sur l'IP COMPLÈTE, hachée :
  //   - complète, parce qu'une limitation par /24 grouperait tout un bureau ou
  //     tout un opérateur mobile, et ferait perdre des preuves de consentement
  //     à des visiteurs légitimes ;
  //   - hachée, parce que ce fichier promet qu'aucune IP ne circule en clair,
  //     et que cette promesse vaut aussi pour le magasin du rate limiter.
  const { success } = await limiter.limit(`consentement:${hacher(ip)}`)
  if (!success) {
    // 204 comme dans le cas nominal : le bandeau n'a rien à faire de cette
    // information, et une erreur visible n'apporterait rien au visiteur.
    return new NextResponse(null, { status: 204 })
  }

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
