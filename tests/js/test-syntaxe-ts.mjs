/**
 * Test 6 — syntaxe des fichiers TypeScript/TSX livrés.
 *
 * Ces fichiers sont des MODÈLES : ils importent `@/lib/db`, `next/server`, zod…
 * qui n'existent pas dans ce dépôt. Une vérification de types complète est donc
 * impossible ici, et le prétendre serait malhonnête. Ce que ce test garantit,
 * c'est qu'aucun fichier n'est syntaxiquement cassé — le défaut qui rendrait le
 * modèle inutilisable dès le copier-coller.
 *
 * Il vérifie en plus quelques invariants que la revue a identifiés comme
 * régressions possibles, par analyse du texte source.
 *
 *   node tests/js/test-syntaxe-ts.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '../..')

const FICHIERS = [
  'conformite/code/consentement/ConsentementProvider.tsx',
  'conformite/code/consentement/route-journal.ts',
  'conformite/code/effacement/route-export.ts',
  'conformite/code/effacement/route-suppression.ts',
  'conformite/code/effacement/route-annulation.ts',
  'conformite/code/retention/politique-retention.ts',
  'conformite/code/retention/purge.ts',
]

let reussis = 0
const echecs = []

function verifier(nom, condition, detail = '') {
  if (condition) reussis++
  else echecs.push(`${nom}${detail ? ' — ' + detail : ''}`)
}

/* ------------------------------------------------------------- 6.1 syntaxe */

for (const rel of FICHIERS) {
  const chemin = resolve(RACINE, rel)
  const source = readFileSync(chemin, 'utf8')

  const fichier = ts.createSourceFile(
    chemin,
    source,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true,
    rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )

  // `parseDiagnostics` n'est pas dans l'API publique mais c'est le seul moyen
  // d'obtenir les erreurs de syntaxe sans résoudre les modules.
  const diags = fichier.parseDiagnostics ?? []
  const messages = diags.map((d) => {
    const { line, character } = fichier.getLineAndCharacterOfPosition(d.start ?? 0)
    return `${relative(RACINE, chemin)}:${line + 1}:${character + 1} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
  })

  verifier(`6.1 syntaxe ${rel}`, messages.length === 0, messages.join(' | '))
}

/* --------------------------------------------------- 6.2 invariants de fond */

const lire = (rel) => readFileSync(resolve(RACINE, rel), 'utf8')

{
  const purge = lire('conformite/code/retention/purge.ts')

  verifier(
    '6.2 purge : plus de randomUUID() interpolé dans le SQL',
    !/randomUUID\(\)/.test(purge),
    'une valeur figée en JS serait identique pour toutes les lignes du même UPDATE'
  )
  verifier(
    '6.2 purge : la clause inclut le marqueur d’idempotence',
    /marqueurTraite.*is null|is null.*marqueurTraite/s.test(purge)
  )
  verifier(
    '6.2 purge : la politique est validée avant toute écriture',
    purge.indexOf('validerPolitique()') !== -1 &&
      purge.indexOf('validerPolitique()') < purge.indexOf('traiter(regle)')
  )
  verifier(
    '6.2 purge : chaque règle tourne dans une transaction',
    /sql\.begin\(/.test(purge)
  )
  verifier(
    '6.2 purge : comptage par RETURNING, pas par pré-comptage',
    /returning 1 as x/.test(purge)
  )
}

{
  const politique = lire('conformite/code/retention/politique-retention.ts')
  verifier(
    '6.2 politique : l’anonymisation de l’email est une expression SQL par ligne',
    /gen_random_uuid\(\)/.test(politique)
  )
  verifier(
    '6.2 politique : la règle utilisateurs porte un marqueurTraite',
    /marqueurTraite: 'anonymise_le'/.test(politique)
  )
}

{
  const suppression = lire('conformite/code/effacement/route-suppression.ts')
  verifier(
    '6.2 suppression : la phase 1 est transactionnelle',
    /sql\.begin\(/.test(suppression)
  )
  verifier(
    '6.2 suppression : aucune destruction de données personnelles en phase 1',
    !/delete from (adresses|favoris|paniers|notifications|fichiers)/.test(suppression),
    'la fenêtre de rétractation serait fictive'
  )
  verifier(
    '6.2 suppression : le hash du mot de passe est préservé en phase 1',
    !/mot_de_passe_hash = null/.test(suppression),
    'sans mot de passe, impossible de se reconnecter après rétractation'
  )
  verifier(
    '6.2 suppression : le jeton de rétractation est stocké haché',
    /createHash\('sha256'\)/.test(suppression)
  )
  verifier(
    '6.2 suppression : jeton issu d’un CSPRNG',
    /randomBytes\(32\)/.test(suppression) && !/Math\.random/.test(suppression)
  )
}

{
  const annulation = lire('conformite/code/effacement/route-annulation.ts')
  verifier(
    '6.2 annulation : la route de rétractation existe et est transactionnelle',
    /sql\.begin\(/.test(annulation)
  )
  verifier(
    '6.2 annulation : jeton à usage unique (invalidé après emploi)',
    /annulation_token_hash = null/.test(annulation)
  )
  verifier(
    '6.2 annulation : expiration vérifiée',
    /annulation_expire_le > now\(\)/.test(annulation)
  )
  verifier(
    '6.2 annulation : route publique protégée par rate limiting',
    /limiter\.limit/.test(annulation)
  )
}

{
  const journal = lire('conformite/code/consentement/route-journal.ts')
  verifier(
    '6.2 journal : route publique protégée par rate limiting',
    /limiter\.limit/.test(journal)
  )
  verifier(
    '6.2 journal : l’insertion ne stocke qu’une empreinte, jamais l’IP',
    /\$\{empreinteIp\(ip\)\}/.test(journal) &&
      !/insert into journal_consentement[\s\S]*?\$\{ip\}/.test(journal)
  )
  verifier(
    '6.2 journal : la clé de rate limiting est hachée elle aussi',
    /limiter\.limit\(`consentement:\$\{hacher\(ip\)\}`\)/.test(journal),
    'une IP en clair dans le magasin du limiteur reste une IP en clair'
  )
}

{
  const exportation = lire('conformite/code/effacement/route-export.ts')
  verifier(
    '6.2 export : aucun identifiant accepté depuis la requête',
    !/params\.|searchParams\.get\(['"]id/.test(exportation),
    'une IDOR ici exposerait le dossier complet d’une personne'
  )
  verifier(
    '6.2 export : pas de « where visiteur_id = null » silencieux',
    !/visiteur_id = \$\{session\.user\.consentementId \?\? null\}/.test(exportation)
  )
  verifier(
    '6.2 export : l’export dit ce qu’il ne contient pas',
    /_non_inclus/.test(exportation)
  )
}

/* ---------------------------------------------------------------- rapport */

console.log(`\n  TEST 6 — syntaxe et invariants : ${reussis} assertion(s) réussie(s), ${echecs.length} échec(s)`)
for (const e of echecs) console.log(`    ECHEC : ${e}`)
if (echecs.length > 0) process.exit(1)
console.log('  TEST 6 — syntaxe et invariants : OK\n')
