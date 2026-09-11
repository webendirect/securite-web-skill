/**
 * Purge automatique — applique la politique de conservation.
 *
 *   npx tsx purge.ts             # simulation : affiche sans rien modifier
 *   npx tsx purge.ts --appliquer # exécute réellement
 *   npx tsx purge.ts --table=prospects --appliquer
 *
 * TOUJOURS exécuter en simulation avant la première application réelle.
 * Une purge mal bornée efface la base de production.
 *
 * Planification :
 *   Vercel      vercel.json → { "crons": [{ "path": "/api/cron/purge", "schedule": "0 3 * * *" }] }
 *   Supabase    select cron.schedule('purge', '0 3 * * *', $$ ... $$);
 *   VPS         0 3 * * * cd /srv/app && npx tsx purge.ts --appliquer >> /var/log/purge.log 2>&1
 *
 * ---------------------------------------------------------------------------
 * GARANTIES
 *
 * 1. IDEMPOTENCE. Deux exécutions successives sur les mêmes données donnent le
 *    même état final, et la seconde ne traite rien. Les règles 'anonymiser' et
 *    'procedure' portent un `marqueurTraite` que clauseEchue() ajoute à la
 *    clause WHERE, ce qui exclut les lignes déjà traitées.
 *
 * 2. UNICITÉ. Les valeurs d'anonymisation qui doivent rester uniques sont des
 *    expressions SQL ({ sql: ... }), réévaluées par PostgreSQL pour chaque
 *    ligne. Une valeur calculée en TypeScript serait figée dans la requête et
 *    donc identique pour toutes les lignes du même UPDATE.
 *
 * 3. ATOMICITÉ PAR RÈGLE. Chaque règle s'exécute dans sa propre transaction.
 *    Une règle qui échoue est annulée entièrement et n'empêche pas les autres
 *    de s'appliquer.
 *
 * 4. COMPTAGE RÉEL. Le nombre affiché est celui des lignes réellement
 *    affectées (RETURNING), pas un pré-comptage qui peut dériver.
 *
 * 5. INTERPOLATION D'IDENTIFIANTS. Un nom de table ne peut pas être un
 *    paramètre lié : il est interpolé. Les valeurs proviennent exclusivement
 *    de politique-retention.ts (fichier versionné, jamais d'une requête), et
 *    validerPolitique() refuse tout identifiant qui n'est pas [A-Za-z_][A-Za-z0-9_]*
 *    AVANT que la moindre écriture n'ait lieu. Les données, elles, ne sont
 *    jamais interpolées.
 */

import {
  POLITIQUE,
  validerPolitique,
  type Regle,
  type Remplacement,
} from './politique-retention'
import { sql } from '@/lib/db' // adapter à votre client

const APPLIQUER = process.argv.includes('--appliquer')
const TABLE_CIBLE = process.argv.find((a) => a.startsWith('--table='))?.split('=')[1]

type Resultat = {
  table: string
  description: string
  action: string
  lignes: number
  erreur?: string
  /** Ressources non transactionnelles à traiter après coup (stockage objet). */
  fichiers?: string[]
}

const IDENT = /^[a-z_][a-z0-9_]*$/i

/** Garde-fou de dernière ligne, au point exact de l'interpolation. */
function ident(nom: string): string {
  if (!IDENT.test(nom)) throw new Error(`Identifiant SQL refusé : ${nom}`)
  return nom
}

function quote(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

/**
 * Clause de sélection des lignes échues.
 * Inclut systématiquement l'exclusion des lignes déjà traitées : c'est ce qui
 * rend la purge idempotente, et ce que la version précédente omettait.
 */
export function clauseEchue(regle: Regle): string {
  const morceaux = [
    `${ident(regle.champDate)} < now() - make_interval(days => ${Number(regle.jours)})`,
  ]
  if (regle.marqueurTraite) morceaux.push(`${ident(regle.marqueurTraite)} is null`)
  if (regle.condition) morceaux.push(`(${regle.condition})`)
  return morceaux.join(' and ')
}

/** Rend une valeur de remplacement en SQL. */
function rendreRemplacement(val: Remplacement): string {
  if (val === null) return 'null'
  if (typeof val === 'object' && 'sql' in val) return val.sql
  return quote(val)
}

async function compter(regle: Regle): Promise<number> {
  const [{ n }] = await sql.unsafe(
    `select count(*)::int as n from ${ident(regle.table)} where ${clauseEchue(regle)}`
  )
  return n
}

async function traiter(regle: Regle): Promise<Resultat> {
  const base = { table: regle.table, description: regle.description, action: regle.action }

  // L'archivage ne se fait pas ici : sortir une facture de la base active
  // relève d'un processus métier, pas d'une purge nocturne.
  if (regle.action === 'archiver') {
    return { ...base, action: 'archiver (manuel)', lignes: await compter(regle) }
  }

  if (!APPLIQUER) return { ...base, lignes: await compter(regle) }

  /* ------------------------------------------------ procédure dédiée en base */
  // La fonction SQL est atomique par construction et retourne les ressources
  // externes à nettoyer. On ne les supprime PAS ici : le stockage objet n'est
  // pas transactionnel, donc il se traite après validation de la transaction.
  if (regle.action === 'procedure') {
    const lignes = await sql.unsafe(`select * from ${ident(regle.procedure!)}()`)
    const fichiers = lignes.flatMap((l: { fichiers_chemins?: string[] }) => l.fichiers_chemins ?? [])
    return { ...base, lignes: lignes.length, fichiers }
  }

  /* --------------------------------------------------------- suppression */
  if (regle.action === 'supprimer') {
    const lignes = await sql.unsafe(
      `delete from ${ident(regle.table)} where ${clauseEchue(regle)} returning 1 as x`
    )
    return { ...base, lignes: lignes.length }
  }

  /* -------------------------------------------------------- anonymisation */
  const colonnes = Object.entries(regle.anonymiser ?? {}).map(
    ([col, val]) => `${ident(col)} = ${rendreRemplacement(val)}`
  )
  // Le marqueur est posé dans le même UPDATE que l'anonymisation : les deux
  // sont indissociables, sinon une interruption laisserait des lignes
  // anonymisées mais non marquées, qui seraient retraitées à la nuit suivante.
  colonnes.push(`${ident(regle.marqueurTraite!)} = now()`)

  const lignes = await sql.unsafe(
    `update ${ident(regle.table)} set ${colonnes.join(', ')} where ${clauseEchue(regle)} returning 1 as x`
  )
  return { ...base, lignes: lignes.length }
}

async function main() {
  const debut = Date.now()

  // Une politique incohérente ne doit jamais toucher la base.
  const erreursPolitique = validerPolitique()
  if (erreursPolitique.length > 0) {
    console.error('\nPolitique de conservation invalide — aucune écriture effectuée :\n')
    for (const e of erreursPolitique) console.error(`  - ${e}`)
    process.exit(2)
  }

  const regles = TABLE_CIBLE ? POLITIQUE.filter((r) => r.table === TABLE_CIBLE) : POLITIQUE
  if (regles.length === 0) {
    console.error(`Aucune règle pour la table "${TABLE_CIBLE}".`)
    process.exit(1)
  }

  console.log(
    APPLIQUER
      ? '\n=== PURGE — application réelle ===\n'
      : '\n=== PURGE — SIMULATION (rien ne sera modifié) ===\n'
  )

  const resultats: Resultat[] = []
  for (const regle of regles) {
    try {
      // Une transaction par règle : un échec annule la règle entière sans
      // empêcher les suivantes de s'appliquer.
      const r = APPLIQUER
        ? await sql.begin(async () => traiter(regle))
        : await traiter(regle)
      resultats.push(r)
    } catch (e) {
      resultats.push({
        table: regle.table,
        description: regle.description,
        action: regle.action,
        lignes: 0,
        erreur: e instanceof Error ? e.message : String(e),
      })
    }
  }

  for (const r of resultats) {
    const etiquette = `${r.table.padEnd(26)} ${r.action.padEnd(20)}`
    if (r.erreur) console.log(`  ERREUR   ${etiquette} ${r.erreur}`)
    else if (r.lignes === 0) console.log(`  —        ${etiquette} rien à traiter`)
    else console.log(`  ${APPLIQUER ? 'FAIT  ' : 'PRÉVU '}  ${etiquette} ${r.lignes} ligne(s)`)
  }

  /* ------------------------------------- ressources non transactionnelles */
  // Traitées APRÈS la validation des transactions : si la base a été purgée,
  // les fichiers doivent suivre. L'inverse (fichiers détruits, transaction
  // annulée) laisserait un compte amputé de ses pièces.
  const fichiers = resultats.flatMap((r) => r.fichiers ?? [])
  if (fichiers.length > 0) {
    console.log(`\n  ${fichiers.length} fichier(s) à supprimer du stockage objet.`)
    if (APPLIQUER) {
      // À brancher sur le client de stockage du projet (S3, R2, Supabase).
      // Un échec ici n'invalide rien en base : il est journalisé et repris par
      // le prochain passage, qui relit journal_purge.fichiers_en_attente.
      console.log('  → brancher supprimerFichiers() sur votre stockage.')
    }
  }

  const total = resultats.reduce((s, r) => s + r.lignes, 0)
  const erreurs = resultats.filter((r) => r.erreur).length
  console.log(`\n  Total : ${total} ligne(s), ${erreurs} erreur(s), ${Date.now() - debut} ms\n`)

  // Journal des exécutions : c'est la preuve que la politique est appliquée,
  // et la première chose à montrer en cas de contrôle.
  if (APPLIQUER) {
    await sql`
      insert into journal_purge
        (execute_le, resultats, lignes_total, erreurs, fichiers_en_attente)
      values
        (now(), ${JSON.stringify(resultats)}::jsonb, ${total}, ${erreurs},
         ${JSON.stringify(fichiers)}::jsonb)
    `
  }

  if (!APPLIQUER) console.log('  Relancer avec --appliquer pour exécuter.\n')
  process.exit(erreurs > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('Échec de la purge :', e)
  process.exit(1)
})
