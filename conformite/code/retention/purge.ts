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
 */

import { randomUUID } from 'node:crypto'
import { POLITIQUE, type Regle } from './politique-retention'
import { sql } from '@/lib/db' // adapter à votre client

const APPLIQUER = process.argv.includes('--appliquer')
const TABLE_CIBLE = process.argv.find((a) => a.startsWith('--table='))?.split('=')[1]

type Resultat = { table: string; action: string; lignes: number; erreur?: string }

/** Construit la clause de sélection des lignes échues. */
function clauseEchue(regle: Regle): string {
  const base = `${regle.champDate} < now() - interval '${regle.jours} days'`
  return regle.condition ? `${base} and (${regle.condition})` : base
}

async function compter(regle: Regle): Promise<number> {
  const [{ n }] = await sql.unsafe(
    `select count(*)::int as n from ${regle.table} where ${clauseEchue(regle)}`
  )
  return n
}

async function traiter(regle: Regle): Promise<Resultat> {
  const action = regle.action

  // L'archivage ne se fait pas ici : sortir une facture de la base active
  // relève d'un processus métier, pas d'une purge nocturne.
  if (action === 'archiver') {
    const n = await compter(regle)
    return { table: regle.table, action: 'archiver (manuel)', lignes: n }
  }

  const n = await compter(regle)
  if (n === 0 || !APPLIQUER) return { table: regle.table, action, lignes: n }

  if (action === 'supprimer') {
    await sql.unsafe(`delete from ${regle.table} where ${clauseEchue(regle)}`)
    return { table: regle.table, action, lignes: n }
  }

  // Anonymisation : l'email doit rester unique (contrainte d'index), donc on
  // le remplace par une valeur générée plutôt que par NULL.
  const colonnes = Object.entries(regle.anonymiser ?? {}).map(([col, val]) => {
    if (col === 'email') return `${col} = 'supprime+' || ${quote(randomUUID())} || '@invalide.local'`
    return `${col} = ${val === null ? 'null' : quote(val)}`
  })
  colonnes.push('anonymise_le = now()')

  await sql.unsafe(
    `update ${regle.table} set ${colonnes.join(', ')} where ${clauseEchue(regle)}`
  )
  return { table: regle.table, action, lignes: n }
}

function quote(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

async function main() {
  const debut = Date.now()
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
      resultats.push(await traiter(regle))
    } catch (e) {
      resultats.push({
        table: regle.table,
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

  const total = resultats.reduce((s, r) => s + r.lignes, 0)
  const erreurs = resultats.filter((r) => r.erreur).length
  console.log(`\n  Total : ${total} ligne(s), ${erreurs} erreur(s), ${Date.now() - debut} ms\n`)

  // Journal des exécutions : c'est la preuve que la politique est appliquée,
  // et la première chose à montrer en cas de contrôle.
  if (APPLIQUER) {
    await sql`
      insert into journal_purge (execute_le, resultats, lignes_total, erreurs)
      values (now(), ${JSON.stringify(resultats)}::jsonb, ${total}, ${erreurs})
    `
  }

  if (!APPLIQUER) console.log('  Relancer avec --appliquer pour exécuter.\n')
  process.exit(erreurs > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('Échec de la purge :', e)
  process.exit(1)
})
