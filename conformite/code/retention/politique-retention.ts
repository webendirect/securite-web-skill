/**
 * Politique de conservation — déclaration centrale des durées.
 *
 * Un seul endroit décrit combien de temps chaque donnée est conservée et ce
 * qu'il advient au terme. Le script de purge lit ce fichier ; la politique de
 * confidentialité doit en être le reflet exact.
 *
 * Ajouter une table qui contient des données personnelles sans l'y déclarer
 * est le manquement le plus courant : prévoir un test qui compare cette liste
 * au schéma réel de la base.
 */

export type Action =
  | 'supprimer'      // la ligne disparaît
  | 'anonymiser'     // la ligne reste, l'identification disparaît irréversiblement
  | 'archiver'       // sort de la base active, accès restreint (obligation légale)

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
  anonymiser?: Record<string, string | null>
  /** Condition SQL supplémentaire (ex. ne purger que les comptes non premium). */
  condition?: string
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
      email: null,          // remplacé par une valeur unique générée à la purge
      nom: 'Compte supprimé',
      prenom: null,
      telephone: null,
      adresse: null,
      avatar_url: null,
      mot_de_passe_hash: null,
    },
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

/** Résumé lisible, pour la politique de confidentialité et le registre. */
export function resumeLisible(): string {
  const format = (j: number) => {
    if (j === 0) return 'immédiatement'
    if (j % ANS === 0) return `${j / ANS} an${j / ANS > 1 ? 's' : ''}`
    if (j % MOIS === 0) return `${j / MOIS} mois`
    return `${j} jours`
  }
  const verbe = { supprimer: 'Suppression', anonymiser: 'Anonymisation', archiver: 'Archivage' }
  return POLITIQUE
    .map((r) => `${r.description} — ${format(r.jours)} — ${verbe[r.action]} (${r.fondement})`)
    .join('\n')
}
