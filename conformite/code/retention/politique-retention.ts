/**
 * Politique de conservation — déclaration centrale des durées.
 *
 * Un seul endroit décrit combien de temps chaque donnée est conservée et ce
 * qu'il advient au terme. Le script de purge lit ce fichier ; la politique de
 * confidentialité doit en être le reflet exact.
 *
 * Ajouter une table qui contient des données personnelles sans l'y déclarer
 * est le manquement le plus courant : le test tests/sql/02-test-purge.sql
 * vérifie que chaque règle vise une table et des colonnes réelles.
 *
 * IDEMPOTENCE — règle de conception centrale de ce fichier.
 * Une purge tourne toutes les nuits sur les mêmes données. Une règle qui ne
 * sait pas reconnaître ce qu'elle a déjà traité retraite les mêmes lignes
 * indéfiniment : compteurs faux, écritures inutiles, et collision d'unicité
 * sur les valeurs d'anonymisation. Toute règle 'anonymiser' ou 'procedure'
 * DOIT donc porter un `marqueurTraite` ; la purge y ajoute automatiquement
 * « and <marqueurTraite> is null ».
 */

export type Action =
  | 'supprimer'      // la ligne disparaît
  | 'anonymiser'     // la ligne reste, l'identification disparaît irréversiblement
  | 'archiver'       // sort de la base active, accès restreint (obligation légale)
  | 'procedure'      // délégué à une fonction SQL dédiée (voir `procedure`)

/**
 * Valeur de remplacement pour une colonne anonymisée.
 *
 *   null            -> SQL NULL
 *   'texte'         -> littéral, échappé
 *   { sql: '...' }  -> expression SQL évaluée PAR LIGNE
 *
 * La forme { sql } est indispensable pour tout ce qui doit rester unique :
 * une valeur calculée en TypeScript est figée dans la requête, donc identique
 * pour toutes les lignes d'un même UPDATE — ce qui viole immédiatement un
 * index unique dès la deuxième ligne.
 */
export type Remplacement = string | null | { sql: string }

export type Regle = {
  /** Table concernée. */
  table: string
  /** Ce que la table contient, en clair — sert au registre des traitements. */
  description: string
  /** Colonne de date qui déclenche le décompte. */
  champDate: string
  /** Durée de conservation, en jours. */
  jours: number
  /** Ce qu'on fait au terme. */
  action: Action
  /** Pour 'anonymiser' : colonnes à neutraliser et valeur de remplacement. */
  anonymiser?: Record<string, Remplacement>
  /**
   * Colonne horodatée renseignée quand la ligne a été traitée. Exclut
   * automatiquement les lignes déjà traitées : c'est ce qui rend la purge
   * idempotente. Obligatoire pour 'anonymiser' et 'procedure'.
   */
  marqueurTraite?: string
  /** Condition SQL supplémentaire (ex. ne purger que les comptes non premium). */
  condition?: string
  /** Pour 'procedure' : nom de la fonction SQL à appeler. */
  procedure?: string
  /** Pourquoi cette durée — apparaît dans le registre et la doc client. */
  fondement: string
}

const ANS = 365
const MOIS = 30

export const POLITIQUE: Regle[] = [
  /* ---------------------------------------------------------- prospection */
  {
    table: 'prospects',
    description: 'Contacts sans relation commerciale établie',
    champDate: 'dernier_contact_le',
    jours: 3 * ANS,
    action: 'supprimer',
    fondement: 'Recommandation CNIL : 3 ans après le dernier contact',
  },
  {
    table: 'messages_contact',
    description: 'Messages reçus via le formulaire de contact',
    champDate: 'cree_le',
    jours: 1 * ANS,
    action: 'supprimer',
    condition: "statut = 'sans_suite'",
    fondement: 'Proportionnalité : sans suite commerciale, 1 an suffit',
  },
  {
    table: 'abonnes_newsletter',
    description: 'Inscrits à la lettre d’information',
    champDate: 'desinscrit_le',
    jours: 3 * ANS,
    action: 'supprimer',
    condition: 'desinscrit_le is not null',
    fondement: 'Preuve du retrait de consentement conservée 3 ans',
  },

  /* -------------------------------------------------------------- comptes */
  {
    table: 'utilisateurs',
    description: 'Comptes clients inactifs',
    champDate: 'derniere_connexion_le',
    jours: 3 * ANS,
    action: 'anonymiser',
    anonymiser: {
      // gen_random_uuid() est réévalué pour CHAQUE ligne. Sans cela, un seul
      // UPDATE écrirait la même adresse partout et l'index unique sur email
      // ferait échouer la purge dès le deuxième compte échu.
      email: { sql: "'supprime+' || gen_random_uuid() || '@invalide.local'" },
      nom: 'Compte supprimé',
      prenom: null,
      telephone: null,
      adresse: null,
      avatar_url: null,
      mot_de_passe_hash: null,
    },
    marqueurTraite: 'anonymise_le',
    // Un compte en cours de suppression volontaire relève de la procédure
    // d'effacement (phase 2), pas de la purge d'inactivité.
    condition: 'supprime_le is null',
    fondement:
      'Plus de finalité active après 3 ans sans connexion. Anonymisation ' +
      'plutôt que suppression, pour préserver l’intégrité des commandes.',
  },
  {
    table: 'sessions',
    description: 'Sessions d’authentification',
    champDate: 'expire_le',
    jours: 0,
    action: 'supprimer',
    fondement: 'Aucune raison de conserver une session expirée',
  },
  {
    table: 'tokens_reinitialisation',
    description: 'Jetons de réinitialisation de mot de passe',
    champDate: 'cree_le',
    jours: 7,
    action: 'supprimer',
    fondement: 'Jeton valable 1 h ; 7 jours de marge pour le diagnostic',
  },

  /* --------------------------------------------- effacement à la demande */
  {
    table: 'utilisateurs',
    description: 'Comptes supprimés dont la fenêtre de rétractation est échue',
    champDate: 'purge_prevue_le',
    jours: 0, // l'échéance est déjà portée par purge_prevue_le
    action: 'procedure',
    procedure: 'purger_comptes_supprimes',
    marqueurTraite: 'purge_effectuee_le',
    condition: 'supprime_le is not null',
    fondement:
      'Phase 2 de l’effacement (art. 17). La durée de la fenêtre de ' +
      'rétractation est un choix métier, fixé à la demande de suppression.',
  },

  /* -------------------------------------------------------- obligations légales */
  {
    table: 'factures',
    description: 'Factures et pièces comptables',
    champDate: 'emise_le',
    jours: 10 * ANS,
    action: 'archiver',
    fondement: 'Code de commerce, article L123-22 : 10 ans',
  },

  /* ------------------------------------------------------------ technique */
  {
    table: 'journal_acces',
    description: 'Journaux de connexion et d’accès',
    champDate: 'cree_le',
    jours: 12 * MOIS,
    action: 'supprimer',
    fondement: 'LCEN : conservation des données de connexion, 1 an',
  },
  {
    table: 'journal_consentement',
    description: 'Preuve des choix de cookies',
    champDate: 'horodatage',
    jours: 6 * MOIS + 3 * ANS,
    action: 'supprimer',
    fondement: 'Durée du consentement (6 mois) + 3 ans de charge de la preuve',
  },
  {
    table: 'demandes_rgpd',
    description: 'Registre des demandes d’exercice de droits',
    champDate: 'cree_le',
    jours: 3 * ANS,
    action: 'supprimer',
    fondement: 'Preuve du traitement de la demande dans le délai légal',
  },

  /* ------------------------------------------------------------ candidatures */
  {
    table: 'candidatures',
    description: 'CV et candidatures spontanées',
    champDate: 'recue_le',
    jours: 2 * ANS,
    action: 'supprimer',
    fondement: 'Recommandation CNIL : 2 ans après le dernier contact',
  },
]

/** Formate une durée en jours de façon lisible : « 3 ans et 6 mois », « 7 jours ». */
export function formatDuree(jours: number): string {
  if (jours === 0) return 'immédiatement'
  const ans = Math.floor(jours / ANS)
  const reste = jours - ans * ANS
  const mois = Math.floor(reste / MOIS)
  const j = reste - mois * MOIS
  const parts: string[] = []
  if (ans) parts.push(`${ans} an${ans > 1 ? 's' : ''}`)
  if (mois) parts.push(`${mois} mois`)
  if (j) parts.push(`${j} jour${j > 1 ? 's' : ''}`)
  return parts.join(' et ')
}

/** Résumé lisible, pour la politique de confidentialité et le registre. */
export function resumeLisible(politique: Regle[] = POLITIQUE): string {
  const verbe: Record<Action, string> = {
    supprimer: 'Suppression',
    anonymiser: 'Anonymisation',
    archiver: 'Archivage',
    procedure: 'Procédure dédiée',
  }
  return politique
    .map((r) => `${r.description} — ${formatDuree(r.jours)} — ${verbe[r.action]} (${r.fondement})`)
    .join('\n')
}

/**
 * Contrôle de cohérence de la politique elle-même, exécuté par la purge avant
 * toute écriture. Une politique incohérente est un risque de suppression
 * incorrecte : mieux vaut refuser de tourner que purger de travers.
 *
 * Valide aussi la forme des identifiants, parce que la purge les interpole
 * dans le SQL (un nom de table ne peut pas être un paramètre lié).
 */
export function validerPolitique(politique: Regle[] = POLITIQUE): string[] {
  const erreurs: string[] = []
  const identifiant = /^[a-z_][a-z0-9_]*$/i

  for (const r of politique) {
    const ou = `${r.table}/${r.description}`
    if (!identifiant.test(r.table)) erreurs.push(`${ou} : nom de table invalide`)
    if (!identifiant.test(r.champDate)) erreurs.push(`${ou} : champDate invalide`)
    if (r.marqueurTraite && !identifiant.test(r.marqueurTraite)) {
      erreurs.push(`${ou} : marqueurTraite invalide`)
    }
    if (!Number.isInteger(r.jours) || r.jours < 0) {
      erreurs.push(`${ou} : durée invalide (${r.jours})`)
    }

    if (r.action === 'anonymiser') {
      if (!r.anonymiser || Object.keys(r.anonymiser).length === 0) {
        erreurs.push(`${ou} : action 'anonymiser' sans colonnes à neutraliser`)
      }
      // Sans marqueur, la règle retraiterait les mêmes lignes chaque nuit.
      if (!r.marqueurTraite) {
        erreurs.push(`${ou} : action 'anonymiser' sans marqueurTraite (purge non idempotente)`)
      }
      for (const col of Object.keys(r.anonymiser ?? {})) {
        if (!identifiant.test(col)) erreurs.push(`${ou} : colonne '${col}' invalide`)
      }
    }

    if (r.action === 'procedure') {
      if (!r.procedure || !identifiant.test(r.procedure)) {
        erreurs.push(`${ou} : action 'procedure' sans fonction SQL valide`)
      }
      if (!r.marqueurTraite) {
        erreurs.push(`${ou} : action 'procedure' sans marqueurTraite`)
      }
    }
  }
  return erreurs
}
