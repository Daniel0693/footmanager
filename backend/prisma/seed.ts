import {
  PermissionAction,
  PermissionScope,
  PrismaClient,
  ScoutingDimension,
  SportType,
} from '@prisma/client';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────
// Helpers idempotents — pas de contrainte unique fiable en base pour ces
// entités système (le champ clubId nullable rend un @@unique([name, clubId])
// inefficace : NULL n'est jamais égal à NULL en SQL), donc on fait un
// findFirst + create/update explicite plutôt qu'un upsert() Prisma.
// ─────────────────────────────────────────────────────────────────────────

async function upsertSystemRole(name: string, description: string) {
  const existing = await prisma.role.findFirst({
    where: { name, isSystem: true, clubId: null },
  });
  if (existing) {
    return prisma.role.update({
      where: { id: existing.id },
      data: { description },
    });
  }
  return prisma.role.create({
    data: { name, description, isSystem: true, clubId: null },
  });
}

async function upsertPermission(
  resource: string,
  action: PermissionAction,
  scope: PermissionScope,
  description: string,
) {
  return prisma.permission.upsert({
    where: { resource_action_scope: { resource, action, scope } },
    update: { description },
    create: { resource, action, scope, description },
  });
}

async function grantPermission(roleId: number, permissionId: number) {
  return prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId, permissionId } },
    update: {},
    create: { roleId, permissionId },
  });
}

async function upsertEvaluationCategory(
  name: string,
  description: string,
  defaultDisplayOrder: number,
  sport: SportType = 'FOOTBALL',
) {
  const existing = await prisma.evaluationCategory.findFirst({
    where: { name, sport, isSystem: true, clubId: null },
  });
  if (existing) {
    return prisma.evaluationCategory.update({
      where: { id: existing.id },
      data: { description, defaultDisplayOrder },
    });
  }
  return prisma.evaluationCategory.create({
    data: {
      name,
      description,
      defaultDisplayOrder,
      sport,
      isSystem: true,
      clubId: null,
    },
  });
}

async function upsertEvaluationCriterion(name: string, categoryId: number) {
  const existing = await prisma.evaluationCriterion.findFirst({
    where: { name, categoryId, isSystem: true, clubId: null },
  });
  if (existing) return existing;
  return prisma.evaluationCriterion.create({
    data: { name, categoryId, isSystem: true, clubId: null },
  });
}

async function upsertPlayingStyleTag(name: string) {
  const existing = await prisma.playingStyleTag.findFirst({
    where: { name, isSystem: true, clubId: null },
  });
  if (existing) return existing;
  return prisma.playingStyleTag.create({
    data: { name, isSystem: true, clubId: null },
  });
}

async function upsertScoutingCriterion(
  name: string,
  dimension: ScoutingDimension,
) {
  const existing = await prisma.playerScoutingCriterion.findFirst({
    where: { name, dimension, isSystem: true, clubId: null },
  });
  if (existing) return existing;
  return prisma.playerScoutingCriterion.create({
    data: { name, dimension, isSystem: true, clubId: null },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Rôles système (docs/modules/auth-roles.md)
// ─────────────────────────────────────────────────────────────────────────

async function seedRoles() {
  const roles = await Promise.all([
    upsertSystemRole(
      'Player',
      'Joueur — accès à son profil, calendrier, convocations, feedback',
    ),
    upsertSystemRole(
      'Parent',
      "Parent d'un joueur — convocations, confirmation de présence, suivi de l'enfant",
    ),
    upsertSystemRole(
      'Coach',
      'Entraîneur — gestion complète de séances, matchs, évaluation joueurs (scopé équipe)',
    ),
    upsertSystemRole(
      'AdminClub',
      "Administrateur d'un club — gestion de l'effectif, des équipes, lecture de tout",
    ),
    upsertSystemRole(
      'SuperAdmin',
      'Rôle technique le plus élevé — accès multi-club et administration de la plateforme',
    ),
    upsertSystemRole(
      'Proprietaire',
      'Propriétaire du club, au-dessus de SuperAdmin',
    ),
  ]);

  const byName = Object.fromEntries(roles.map((role) => [role.name, role]));

  // ── 2. Permissions système + RolePermission ──────────────────────────
  // Ressources déjà réelles en Phase 1 : club, team, member, role. Les
  // permissions des modules futurs (injury, training_session...) seront
  // ajoutées avec leurs modules respectifs (pas anticipées ici).

  const READ: PermissionAction = 'READ';
  const CREATE: PermissionAction = 'CREATE';
  const UPDATE: PermissionAction = 'UPDATE';
  const DELETE: PermissionAction = 'DELETE';
  const OWN: PermissionScope = 'OWN';
  const TEAM: PermissionScope = 'TEAM';
  const CLUB: PermissionScope = 'CLUB';
  const ALL: PermissionScope = 'ALL';

  const permissionSpecsByRole: Record<
    string,
    [string, PermissionAction, PermissionScope, string][]
  > = {
    // Le rôle Parent n'a pas encore de permission player_profile/team_staff :
    // aucune liaison Parent↔Joueur n'est modélisée (voir décision ouverte #5,
    // docs/decisions-ouvertes-et-rgpd.md). À compléter quand elle existera.
    Player: [
      ['member', READ, OWN, 'Consulter son propre profil membre'],
      ['player_profile', READ, OWN, 'Consulter son propre profil joueur'],
      ['team', READ, TEAM, 'Consulter son équipe'],
      ['player_team', READ, TEAM, 'Consulter l’effectif de son équipe'],
      [
        'player_measurement',
        READ,
        OWN,
        'Consulter ses propres mesures physiques',
      ],
      [
        'player_interview',
        READ,
        OWN,
        'Consulter ses propres comptes-rendus d’entretien',
      ],
      [
        'player_note',
        READ,
        OWN,
        'Consulter les notes le concernant (hors notes privées)',
      ],
      [
        'player_objective',
        READ,
        OWN,
        'Consulter ses propres objectifs (hors objectifs privés)',
      ],
      [
        'evaluation_config',
        READ,
        TEAM,
        "Consulter la configuration du radar d'évaluation du club",
      ],
      [
        'player_evaluation',
        READ,
        OWN,
        'Consulter ses propres scores d’évaluation',
      ],
      ['event', READ, TEAM, 'Consulter le calendrier de son équipe'],
    ],
    Parent: [
      ['member', READ, OWN, 'Consulter le profil membre lié à son enfant'],
    ],
    Coach: [
      ['member', READ, TEAM, 'Consulter les membres de ses équipes'],
      ['member', CREATE, TEAM, 'Ajouter un membre à ses équipes'],
      ['member', UPDATE, TEAM, 'Modifier les membres de ses équipes'],
      ['team', READ, TEAM, 'Consulter ses équipes'],
      [
        'player_profile',
        READ,
        TEAM,
        'Consulter les profils joueurs de ses équipes',
      ],
      [
        'player_profile',
        CREATE,
        TEAM,
        'Créer un profil joueur dans ses équipes',
      ],
      [
        'player_profile',
        UPDATE,
        TEAM,
        'Modifier les profils joueurs de ses équipes',
      ],
      // Parité complète PRINCIPAL/CO_ENTRAINEUR/ADJOINT sur la gestion du
      // staff (docs/schema/joueurs.md), sauf modifier/retirer la fiche du
      // Principal — exception gérée au niveau service (TeamStaffService),
      // pas par le système de permission générique.
      ['team_staff', READ, TEAM, 'Consulter le staff de ses équipes'],
      ['team_staff', CREATE, TEAM, 'Affecter un membre du staff à ses équipes'],
      [
        'team_staff',
        UPDATE,
        TEAM,
        'Modifier une affectation de staff de ses équipes',
      ],
      [
        'team_staff',
        DELETE,
        TEAM,
        'Retirer une affectation de staff de ses équipes',
      ],
      ['player_team', READ, TEAM, "Consulter l'effectif de ses équipes"],
      ['player_team', CREATE, TEAM, 'Affecter un joueur à ses équipes'],
      [
        'player_team',
        UPDATE,
        TEAM,
        "Modifier une affectation d'effectif de ses équipes",
      ],
      [
        'player_measurement',
        READ,
        TEAM,
        'Consulter les mesures des joueurs de ses équipes',
      ],
      [
        'player_measurement',
        CREATE,
        TEAM,
        'Ajouter une mesure pour un joueur de ses équipes',
      ],
      [
        'player_measurement',
        DELETE,
        TEAM,
        'Supprimer une mesure erronée pour un joueur de ses équipes',
      ],
      [
        'player_interview',
        READ,
        TEAM,
        'Consulter les entretiens des joueurs de ses équipes',
      ],
      [
        'player_interview',
        CREATE,
        TEAM,
        'Créer un entretien pour un joueur de ses équipes',
      ],
      [
        'player_interview',
        UPDATE,
        TEAM,
        'Modifier un entretien pour un joueur de ses équipes',
      ],
      [
        'player_interview',
        DELETE,
        TEAM,
        'Supprimer un entretien pour un joueur de ses équipes',
      ],
      [
        'player_note',
        READ,
        TEAM,
        'Consulter les notes des joueurs de ses équipes',
      ],
      [
        'player_note',
        CREATE,
        TEAM,
        'Ajouter une note pour un joueur de ses équipes',
      ],
      [
        'player_note',
        UPDATE,
        TEAM,
        'Modifier une note pour un joueur de ses équipes',
      ],
      [
        'player_note',
        DELETE,
        TEAM,
        'Supprimer une note pour un joueur de ses équipes',
      ],
      [
        'player_objective',
        READ,
        TEAM,
        'Consulter les objectifs des joueurs de ses équipes',
      ],
      [
        'player_objective',
        CREATE,
        TEAM,
        'Ajouter un objectif pour un joueur de ses équipes',
      ],
      [
        'player_objective',
        UPDATE,
        TEAM,
        'Modifier un objectif pour un joueur de ses équipes',
      ],
      [
        'player_objective',
        DELETE,
        TEAM,
        'Supprimer un objectif pour un joueur de ses équipes',
      ],
      [
        'evaluation_config',
        READ,
        TEAM,
        "Consulter la configuration du radar d'évaluation du club",
      ],
      [
        'player_evaluation',
        READ,
        TEAM,
        'Consulter les évaluations des joueurs de ses équipes',
      ],
      [
        'player_evaluation',
        CREATE,
        TEAM,
        'Ajouter une évaluation pour un joueur de ses équipes',
      ],
      [
        'player_evaluation',
        UPDATE,
        TEAM,
        'Modifier une évaluation pour un joueur de ses équipes',
      ],
      [
        'player_evaluation',
        DELETE,
        TEAM,
        'Supprimer une évaluation pour un joueur de ses équipes',
      ],
      ['event', READ, TEAM, 'Consulter le calendrier de ses équipes'],
      ['event', CREATE, TEAM, 'Créer un événement pour ses équipes'],
      ['event', UPDATE, TEAM, 'Modifier un événement de ses équipes'],
      ['event', DELETE, TEAM, 'Supprimer un événement de ses équipes'],
    ],
    AdminClub: [
      ['club', READ, CLUB, 'Consulter son club'],
      ['club', UPDATE, CLUB, 'Modifier son club'],
      ['team', READ, CLUB, 'Consulter les équipes du club'],
      ['team', CREATE, CLUB, 'Créer une équipe dans le club'],
      ['team', UPDATE, CLUB, 'Modifier une équipe du club'],
      ['team', DELETE, CLUB, 'Supprimer une équipe du club'],
      ['member', READ, CLUB, 'Consulter les membres du club'],
      ['member', CREATE, CLUB, 'Ajouter un membre au club'],
      ['member', UPDATE, CLUB, 'Modifier un membre du club'],
      ['member', DELETE, CLUB, 'Retirer un membre du club'],
      ['role', READ, CLUB, 'Consulter les rôles disponibles dans le club'],
      [
        'player_profile',
        READ,
        CLUB,
        'Consulter tous les profils joueurs du club',
      ],
      ['player_profile', CREATE, CLUB, 'Créer un profil joueur dans le club'],
      ['player_profile', UPDATE, CLUB, 'Modifier un profil joueur du club'],
      ['player_profile', DELETE, CLUB, 'Supprimer un profil joueur du club'],
      [
        'team_staff',
        READ,
        CLUB,
        'Consulter le staff de toutes les équipes du club',
      ],
      ['team_staff', CREATE, CLUB, 'Affecter un membre du staff à une équipe'],
      ['team_staff', UPDATE, CLUB, 'Modifier une affectation de staff'],
      ['team_staff', DELETE, CLUB, 'Retirer une affectation de staff'],
      [
        'player_team',
        READ,
        CLUB,
        "Consulter l'effectif de toutes les équipes du club",
      ],
      ['player_team', CREATE, CLUB, 'Affecter un joueur à une équipe du club'],
      [
        'player_team',
        UPDATE,
        CLUB,
        "Modifier une affectation d'effectif du club",
      ],
      [
        'player_team',
        DELETE,
        CLUB,
        "Supprimer une affectation d'effectif du club",
      ],
      [
        'player_measurement',
        READ,
        CLUB,
        'Consulter les mesures de tous les joueurs du club',
      ],
      [
        'player_measurement',
        CREATE,
        CLUB,
        'Ajouter une mesure pour un joueur du club',
      ],
      [
        'player_measurement',
        DELETE,
        CLUB,
        "Supprimer une mesure d'un joueur du club",
      ],
      [
        'player_interview',
        READ,
        CLUB,
        'Consulter les entretiens de tous les joueurs du club',
      ],
      [
        'player_interview',
        CREATE,
        CLUB,
        'Créer un entretien pour un joueur du club',
      ],
      [
        'player_interview',
        UPDATE,
        CLUB,
        "Modifier un entretien d'un joueur du club",
      ],
      [
        'player_interview',
        DELETE,
        CLUB,
        "Supprimer un entretien d'un joueur du club",
      ],
      [
        'player_note',
        READ,
        CLUB,
        'Consulter les notes de tous les joueurs du club',
      ],
      ['player_note', CREATE, CLUB, 'Ajouter une note pour un joueur du club'],
      ['player_note', UPDATE, CLUB, "Modifier une note d'un joueur du club"],
      ['player_note', DELETE, CLUB, "Supprimer une note d'un joueur du club"],
      [
        'player_objective',
        READ,
        CLUB,
        'Consulter les objectifs de tous les joueurs du club',
      ],
      [
        'player_objective',
        CREATE,
        CLUB,
        'Ajouter un objectif pour un joueur du club',
      ],
      [
        'player_objective',
        UPDATE,
        CLUB,
        "Modifier un objectif d'un joueur du club",
      ],
      [
        'player_objective',
        DELETE,
        CLUB,
        "Supprimer un objectif d'un joueur du club",
      ],
      [
        'evaluation_config',
        READ,
        CLUB,
        "Consulter la configuration du radar d'évaluation du club",
      ],
      [
        'player_evaluation',
        READ,
        CLUB,
        'Consulter les évaluations de tous les joueurs du club',
      ],
      [
        'player_evaluation',
        CREATE,
        CLUB,
        'Ajouter une évaluation pour un joueur du club',
      ],
      [
        'player_evaluation',
        UPDATE,
        CLUB,
        "Modifier une évaluation d'un joueur du club",
      ],
      [
        'player_evaluation',
        DELETE,
        CLUB,
        "Supprimer une évaluation d'un joueur du club",
      ],
      [
        'event',
        READ,
        CLUB,
        'Consulter le calendrier de toutes les équipes du club',
      ],
      ['event', CREATE, CLUB, 'Créer un événement pour une équipe du club'],
      ['event', UPDATE, CLUB, 'Modifier un événement du club'],
      ['event', DELETE, CLUB, 'Supprimer un événement du club'],
    ],
    SuperAdmin: [
      ['club', READ, ALL, 'Consulter tous les clubs'],
      ['club', CREATE, ALL, 'Créer un club (administration plateforme)'],
      ['club', UPDATE, ALL, "Modifier n'importe quel club"],
      ['club', DELETE, ALL, "Supprimer n'importe quel club"],
      ['team', READ, ALL, "Consulter n'importe quelle équipe"],
      ['team', CREATE, ALL, "Créer une équipe dans n'importe quel club"],
      ['team', UPDATE, ALL, "Modifier n'importe quelle équipe"],
      ['team', DELETE, ALL, "Supprimer n'importe quelle équipe"],
      ['member', READ, ALL, "Consulter n'importe quel membre"],
      ['member', CREATE, ALL, "Ajouter un membre dans n'importe quel club"],
      ['member', UPDATE, ALL, "Modifier n'importe quel membre"],
      ['member', DELETE, ALL, "Retirer n'importe quel membre"],
      ['role', READ, ALL, 'Consulter tous les rôles'],
      ['role', CREATE, ALL, "Créer un rôle dans n'importe quel club"],
      ['role', UPDATE, ALL, "Modifier n'importe quel rôle"],
      ['role', DELETE, ALL, "Supprimer n'importe quel rôle personnalisé"],
      ['player_profile', READ, ALL, "Consulter n'importe quel profil joueur"],
      [
        'player_profile',
        CREATE,
        ALL,
        "Créer un profil joueur dans n'importe quel club",
      ],
      ['player_profile', UPDATE, ALL, "Modifier n'importe quel profil joueur"],
      ['player_profile', DELETE, ALL, "Supprimer n'importe quel profil joueur"],
      [
        'team_staff',
        READ,
        ALL,
        "Consulter le staff de n'importe quelle équipe",
      ],
      [
        'team_staff',
        CREATE,
        ALL,
        "Affecter un membre du staff dans n'importe quelle équipe",
      ],
      [
        'team_staff',
        UPDATE,
        ALL,
        "Modifier n'importe quelle affectation de staff",
      ],
      [
        'team_staff',
        DELETE,
        ALL,
        "Retirer n'importe quelle affectation de staff",
      ],
      [
        'player_team',
        READ,
        ALL,
        "Consulter l'effectif de n'importe quelle équipe",
      ],
      [
        'player_team',
        CREATE,
        ALL,
        "Affecter un joueur dans n'importe quelle équipe",
      ],
      [
        'player_team',
        UPDATE,
        ALL,
        "Modifier n'importe quelle affectation d'effectif",
      ],
      [
        'player_team',
        DELETE,
        ALL,
        "Supprimer n'importe quelle affectation d'effectif",
      ],
      [
        'player_measurement',
        READ,
        ALL,
        "Consulter les mesures de n'importe quel joueur",
      ],
      [
        'player_measurement',
        CREATE,
        ALL,
        "Ajouter une mesure pour n'importe quel joueur",
      ],
      [
        'player_measurement',
        DELETE,
        ALL,
        "Supprimer une mesure de n'importe quel joueur",
      ],
      [
        'player_interview',
        READ,
        ALL,
        "Consulter les entretiens de n'importe quel joueur",
      ],
      [
        'player_interview',
        CREATE,
        ALL,
        "Créer un entretien pour n'importe quel joueur",
      ],
      [
        'player_interview',
        UPDATE,
        ALL,
        "Modifier un entretien de n'importe quel joueur",
      ],
      [
        'player_interview',
        DELETE,
        ALL,
        "Supprimer un entretien de n'importe quel joueur",
      ],
      [
        'player_note',
        READ,
        ALL,
        "Consulter les notes de n'importe quel joueur",
      ],
      [
        'player_note',
        CREATE,
        ALL,
        "Ajouter une note pour n'importe quel joueur",
      ],
      [
        'player_note',
        UPDATE,
        ALL,
        "Modifier une note de n'importe quel joueur",
      ],
      [
        'player_note',
        DELETE,
        ALL,
        "Supprimer une note de n'importe quel joueur",
      ],
      [
        'player_objective',
        READ,
        ALL,
        "Consulter les objectifs de n'importe quel joueur",
      ],
      [
        'player_objective',
        CREATE,
        ALL,
        "Ajouter un objectif pour n'importe quel joueur",
      ],
      [
        'player_objective',
        UPDATE,
        ALL,
        "Modifier un objectif de n'importe quel joueur",
      ],
      [
        'player_objective',
        DELETE,
        ALL,
        "Supprimer un objectif de n'importe quel joueur",
      ],
      [
        'evaluation_config',
        READ,
        ALL,
        "Consulter la configuration du radar d'évaluation de n'importe quel club",
      ],
      [
        'player_evaluation',
        READ,
        ALL,
        "Consulter les évaluations de n'importe quel joueur",
      ],
      [
        'player_evaluation',
        CREATE,
        ALL,
        "Ajouter une évaluation pour n'importe quel joueur",
      ],
      [
        'player_evaluation',
        UPDATE,
        ALL,
        "Modifier une évaluation de n'importe quel joueur",
      ],
      [
        'player_evaluation',
        DELETE,
        ALL,
        "Supprimer une évaluation de n'importe quel joueur",
      ],
      [
        'event',
        READ,
        ALL,
        "Consulter le calendrier de n'importe quelle équipe",
      ],
      ['event', CREATE, ALL, "Créer un événement dans n'importe quelle équipe"],
      ['event', UPDATE, ALL, "Modifier n'importe quel événement"],
      ['event', DELETE, ALL, "Supprimer n'importe quel événement"],
    ],
    // Le mécanisme de transfert sécurisé du rôle Proprietaire est une
    // décision ouverte (docs/decisions-ouvertes-et-rgpd.md) — en attendant,
    // le Proprietaire reçoit le même socle de permissions que le SuperAdmin.
    Proprietaire: [],
  };
  permissionSpecsByRole.Proprietaire = permissionSpecsByRole.SuperAdmin;

  for (const [roleName, specs] of Object.entries(permissionSpecsByRole)) {
    const role = byName[roleName];
    for (const [resource, action, scope, description] of specs) {
      const permission = await upsertPermission(
        resource,
        action,
        scope,
        description,
      );
      await grantPermission(role.id, permission.id);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 3-4. EvaluationCategory + EvaluationCriterion système football
// (docs/schema/joueurs.md)
// ─────────────────────────────────────────────────────────────────────────

async function seedEvaluationCategoriesAndCriteria() {
  const categories: [string, string, string[]][] = [
    [
      'Technique',
      'Maîtrise technique individuelle du ballon',
      [
        'Contrôle de balle',
        'Passe courte',
        'Passe longue',
        'Frappe',
        'Dribble / 1c1',
        'Jeu de tête',
      ],
    ],
    [
      'Tactique',
      'Compréhension et application des principes de jeu',
      [
        'Placement sans ballon',
        'Lecture du jeu',
        'Prise de décision',
        'Pressing',
        "Utilisation de l'espace",
      ],
    ],
    [
      'Physique',
      'Capacités athlétiques et physiques',
      ['Vitesse', 'Endurance', 'Puissance', 'Souplesse / mobilité'],
    ],
    [
      'Mental',
      'Concentration, leadership, combativité',
      [
        'Concentration',
        'Leadership',
        'Combativité',
        'Résilience',
        "Gestion de l'erreur",
      ],
    ],
    [
      'Émotionnel',
      'Gestion du stress, self-control, confiance en soi',
      [
        'Gestion du stress',
        'Self-control',
        'Confiance en soi',
        'Réaction aux critiques',
      ],
    ],
    [
      'Vie de groupe',
      "Attitude, esprit d'équipe, respect, implication collective",
      [
        "Attitude à l'entraînement",
        "Esprit d'équipe",
        'Respect des règles',
        'Ponctualité',
        'Implication hors temps de jeu',
      ],
    ],
  ];

  for (let i = 0; i < categories.length; i++) {
    const [name, description, criteria] = categories[i];
    const category = await upsertEvaluationCategory(name, description, i + 1);
    for (const criterionName of criteria) {
      await upsertEvaluationCriterion(criterionName, category.id);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 5. PlayingStyleTag système (docs/schema/scouting.md)
// ─────────────────────────────────────────────────────────────────────────

async function seedPlayingStyleTags() {
  const tags = [
    'pressing-haut',
    'contre-attaque',
    'possession',
    'jeu-long',
    'bloc-bas',
    'repli-rapide',
    'jeu-direct',
    'jeu-en-triangle',
    'largeur-du-jeu',
    'jeu-combinatoire',
    'transitions-rapides',
    'physique-dominant',
  ];
  for (const tag of tags) {
    await upsertPlayingStyleTag(tag);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 6. PlayerScoutingCriterion système (docs/schema/scouting.md)
// ─────────────────────────────────────────────────────────────────────────

async function seedScoutingCriteria() {
  const criteriaByDimension: [ScoutingDimension, string[]][] = [
    [
      'PHYSIQUE',
      [
        'Gabarit / morphologie',
        'Vitesse de déplacement',
        'Endurance / condition physique',
        'Puissance / force',
      ],
    ],
    [
      'TECHNIQUE',
      [
        'Contrôle de balle',
        'Passe courte',
        'Passe longue / centre',
        'Frappe de balle',
        'Dribble / 1c1',
        'Jeu de tête',
        'Pied faible',
      ],
    ],
    [
      'TACTIQUE',
      [
        'Placement sans ballon',
        'Lecture du jeu',
        'Prise de décision',
        'Pressing et récupération',
        "Utilisation de l'espace",
      ],
    ],
    [
      'MENTAL',
      [
        'Concentration et régularité',
        'Leadership',
        'Attitude et comportement',
        'Combativité',
        'Résilience',
      ],
    ],
  ];

  for (const [dimension, criteria] of criteriaByDimension) {
    for (const name of criteria) {
      await upsertScoutingCriterion(name, dimension);
    }
  }
}

async function main() {
  await seedRoles();
  await seedEvaluationCategoriesAndCriteria();
  await seedPlayingStyleTags();
  await seedScoutingCriteria();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
