/**
 * Seed de DONNÉES DE DÉMO/DEV — distinct de `prisma/seed.ts` (données système :
 * rôles, permissions, catégories/critères d'évaluation, tags de style de jeu,
 * critères de scouting — rejoué à chaque `npx prisma db seed`/`migrate reset`).
 *
 * Ce script peuple un jeu de données réaliste et cohérent (clubs, équipes,
 * joueurs, staff, parents, événements, saisons, championnats, historique par
 * joueur) pour tester/visualiser toutes les actions de l'application. Conçu
 * pour tourner UNE FOIS sur une base fraîchement reset — pas idempotent
 * (contrairement à `seed.ts`), pas d'upsert, uniquement des `create`.
 *
 * Prérequis : les données système doivent déjà exister (`npx prisma db seed`
 * ou `npx prisma migrate reset --force`, qui le fait automatiquement).
 *
 * Usage : npm run seed:dev-data (depuis backend/)
 *
 * Chaque compte `User` créé utilise le mot de passe `Test012345.` (bcrypt,
 * mêmes paramètres que AuthService.register) et est documenté, à la fin de
 * l'exécution, dans docs/dev-seed-accounts.md (écrasé à chaque run).
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  PrismaClient,
  Gender,
  Foot,
  Position,
  TeamStaffRole,
  MeasurementType,
  NoteVisibility,
  ObjectiveTheme,
  ObjectiveHorizon,
  ObjectiveStatus,
  AbsenceReason,
  EventType,
} from '@prisma/client';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12; // même valeur que AuthService (backend/src/auth/auth.service.ts)
const DEFAULT_PASSWORD = 'Test012345.';

// ─────────────────────────────────────────────────────────────────────────
// PRNG déterministe (mulberry32) — même dataset à chaque run sur base vierge
// ─────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed;
  return function rand(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260715);

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function chance(probability: number): boolean {
  return rand() < probability;
}
function choice<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function sample<T>(arr: readonly T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // marques diacritiques combinantes (é→e, etc.)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ─────────────────────────────────────────────────────────────────────────
// Pools de noms (français, pas de dépendance externe type faker)
// ─────────────────────────────────────────────────────────────────────────

const MALE_FIRST_NAMES = [
  'Lucas',
  'Hugo',
  'Nathan',
  'Gabriel',
  'Louis',
  'Adam',
  'Raphaël',
  'Arthur',
  'Jules',
  'Léo',
  'Ethan',
  'Tom',
  'Noah',
  'Sacha',
  'Mohamed',
  'Enzo',
  'Théo',
  'Maxime',
  'Antoine',
  'Julien',
  'Nicolas',
  'Alexandre',
  'Baptiste',
  'Rayan',
  'Yanis',
  'Kylian',
  'Malo',
  'Mattéo',
  'Aaron',
  'Clément',
];
const FEMALE_FIRST_NAMES = [
  'Emma',
  'Jade',
  'Louise',
  'Alice',
  'Chloé',
  'Léa',
  'Manon',
  'Camille',
  'Sarah',
  'Zoé',
  'Inès',
  'Lina',
  'Julia',
  'Rose',
  'Anna',
  'Nina',
  'Maëlys',
  'Agathe',
  'Margaux',
  'Océane',
  'Léna',
  'Amel',
  'Sofia',
  'Eva',
  'Juliette',
  'Charlotte',
  'Clara',
  'Romane',
  'Lucie',
  'Capucine',
];
const LAST_NAMES = [
  'Martin',
  'Bernard',
  'Dubois',
  'Thomas',
  'Robert',
  'Petit',
  'Durand',
  'Leroy',
  'Moreau',
  'Simon',
  'Laurent',
  'Lefebvre',
  'Michel',
  'Garcia',
  'David',
  'Bertrand',
  'Roux',
  'Vincent',
  'Fournier',
  'Morel',
  'Girard',
  'Andre',
  'Lefevre',
  'Mercier',
  'Dupont',
  'Lambert',
  'Bonnet',
  'Francois',
  'Martinez',
  'Legrand',
  'Garnier',
  'Faure',
  'Rousseau',
  'Blanc',
  'Guerin',
  'Muller',
  'Henry',
  'Roussel',
  'Nicolas',
  'Perrin',
];
const EXTERNAL_TEAM_POOL = [
  'US Bellevue',
  'AS Trois Rivières',
  'Stade Montagnard',
  'FC Haute Vallée',
  'Étoile du Nord',
  'Racing Bellecour',
  'Olympique des Tilleuls',
  'AS Portes du Sud',
  'FC Val Fleuri',
  'Stade Lac Bleu',
  'US Coteaux',
  'Entente Rive Gauche',
  'AS Clairefontaine',
  'FC Grand Pré',
  'Amicale du Bois',
  'CS Belle Étoile',
  'FC Les Peupliers',
  'Union Sportive Riveraine',
  'AS Champvert',
  'Stade des Fontaines',
  'Olympique Plateau',
  'FC Bord de Loire',
  'AS Faubourg',
  'Racing des Collines',
];

let externalTeamPoolIdx = 0;
function nextExternalTeamNames(n: number): string[] {
  const names = EXTERNAL_TEAM_POOL.slice(
    externalTeamPoolIdx,
    externalTeamPoolIdx + n,
  );
  externalTeamPoolIdx += n;
  return names;
}

// ─────────────────────────────────────────────────────────────────────────
// Comptes de démo — accumulés au fil du script, écrits dans docs/ à la fin
// ─────────────────────────────────────────────────────────────────────────

interface DemoAccount {
  email: string;
  role: string;
  club: string;
  team?: string;
  notes?: string;
}
const demoAccounts: DemoAccount[] = [];
const emailUsed = new Set<string>();

function makeEmail(
  firstName: string,
  lastName: string,
  clubSlug: string,
): string {
  const base = `${slugify(firstName)}.${slugify(lastName)}@${clubSlug}.footmanager.test`;
  if (!emailUsed.has(base)) {
    emailUsed.add(base);
    return base;
  }
  let n = 2;
  while (
    emailUsed.has(
      `${slugify(firstName)}.${slugify(lastName)}${n}@${clubSlug}.footmanager.test`,
    )
  ) {
    n += 1;
  }
  const email = `${slugify(firstName)}.${slugify(lastName)}${n}@${clubSlug}.footmanager.test`;
  emailUsed.add(email);
  return email;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers Prisma de bas niveau
// ─────────────────────────────────────────────────────────────────────────

async function assertSystemDataPresent(): Promise<void> {
  const [rolesCount, categoriesCount] = await Promise.all([
    prisma.role.count({ where: { isSystem: true } }),
    prisma.evaluationCategory.count({ where: { isSystem: true } }),
  ]);
  if (rolesCount === 0 || categoriesCount === 0) {
    throw new Error(
      'Données système absentes (rôles/catégories d’évaluation). ' +
        'Lance d’abord `npx prisma db seed` (ou `npx prisma migrate reset --force`, qui le fait automatiquement) avant ce script.',
    );
  }
}

async function getSystemRoles() {
  const roles = await prisma.role.findMany({
    where: { isSystem: true, clubId: null },
  });
  const byName = Object.fromEntries(roles.map((r) => [r.name, r]));
  for (const name of [
    'Player',
    'Parent',
    'Coach',
    'AdminClub',
    'SuperAdmin',
    'Proprietaire',
  ]) {
    if (!byName[name]) throw new Error(`Rôle système "${name}" introuvable.`);
  }
  return byName as unknown as Record<
    'Player' | 'Parent' | 'Coach' | 'AdminClub' | 'SuperAdmin' | 'Proprietaire',
    { id: number; name: string }
  >;
}

function randomGender(): Gender {
  return chance(0.5) ? Gender.MALE : Gender.FEMALE;
}
function firstNameFor(gender: Gender): string {
  return gender === Gender.MALE
    ? choice(MALE_FIRST_NAMES)
    : choice(FEMALE_FIRST_NAMES);
}

async function createMember(params: {
  clubId: number;
  firstName: string;
  lastName: string;
  gender: Gender;
  birthDate?: Date;
  phone?: string;
  withLogin: boolean;
  accountMeta?: { role: string; club: string; team?: string; notes?: string };
}) {
  let userId: number | undefined;
  let email: string | undefined;
  if (params.withLogin) {
    const clubSlug = slugify(params.accountMeta?.club ?? String(params.clubId));
    email = makeEmail(params.firstName, params.lastName, clubSlug);
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, passwordHash, emailVerified: true, locale: 'fr' },
    });
    userId = user.id;
    demoAccounts.push({
      email,
      role: params.accountMeta?.role ?? '',
      club: params.accountMeta?.club ?? '',
      team: params.accountMeta?.team,
      notes: params.accountMeta?.notes,
    });
  }
  const member = await prisma.member.create({
    data: {
      userId,
      clubId: params.clubId,
      firstName: params.firstName,
      lastName: params.lastName,
      gender: params.gender,
      birthDate: params.birthDate,
      phone: params.phone,
    },
  });
  return { ...member, email };
}

async function assignMemberRole(
  memberId: number,
  roleId: number,
  ctx: { clubId: number; teamId?: number },
) {
  return prisma.memberRole.create({
    data: { memberId, roleId, clubId: ctx.clubId, teamId: ctx.teamId },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Comptes plateforme (Proprietaire + 3×SuperAdmin) — raccourci DEV-ONLY.
// En usage réel, ces rôles ne sont attribués que via
// backend/scripts/bootstrap-platform-role.ts (jamais en écriture directe).
// ─────────────────────────────────────────────────────────────────────────

async function createPlatformAccounts(
  roles: Awaited<ReturnType<typeof getSystemRoles>>,
) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  const proprietaire = await prisma.user.create({
    data: {
      email: 'proprietaire@footmanager.test',
      passwordHash,
      emailVerified: true,
      locale: 'fr',
    },
  });
  await prisma.userRole.create({
    data: { userId: proprietaire.id, roleId: roles.Proprietaire.id },
  });
  demoAccounts.push({
    email: proprietaire.email,
    role: 'Proprietaire (plateforme)',
    club: '—',
    notes: 'Accès à tous les clubs',
  });

  for (let i = 1; i <= 3; i += 1) {
    const email = `superadmin${i}@footmanager.test`;
    const user = await prisma.user.create({
      data: { email, passwordHash, emailVerified: true, locale: 'fr' },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: roles.SuperAdmin.id },
    });
    demoAccounts.push({
      email,
      role: 'SuperAdmin (plateforme)',
      club: '—',
      notes: 'Accès à tous les clubs',
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Catégories/critères d'évaluation système (lus, jamais recréés) +
// ClubEvaluationConfig — réplique exactement l'étape 5 de ClubsService.create
// ─────────────────────────────────────────────────────────────────────────

async function getSystemEvaluationCriteria() {
  const categories = await prisma.evaluationCategory.findMany({
    where: { isSystem: true, sport: 'FOOTBALL' },
    include: { criteria: { where: { isSystem: true } } },
  });
  if (categories.length === 0) {
    throw new Error('Aucune EvaluationCategory système FOOTBALL trouvée.');
  }
  return categories;
}

async function createClubEvaluationConfig(
  clubId: number,
  categories: Awaited<ReturnType<typeof getSystemEvaluationCriteria>>,
) {
  await prisma.clubEvaluationConfig.createMany({
    data: categories.map((category) => ({
      clubId,
      categoryId: category.id,
      isEnabled: true,
      displayOrder: category.defaultDisplayOrder,
    })),
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Positions — répartition plausible d'un effectif (1-2 gardiens, reste
// réparti défense/milieu/attaque)
// ─────────────────────────────────────────────────────────────────────────

const DEF_POSITIONS = [
  Position.CB,
  Position.RB,
  Position.LB,
  Position.RWB,
  Position.LWB,
];
const MID_POSITIONS = [
  Position.CDM,
  Position.CM,
  Position.RM,
  Position.LM,
  Position.CAM,
];
const ATT_POSITIONS = [Position.RW, Position.LW, Position.CF, Position.ST];

function assignPositions(squadSize: number): Position[] {
  const goalkeepers = squadSize >= 12 ? 2 : 1;
  const remaining = squadSize - goalkeepers;
  const defenders = Math.round(remaining * 0.37);
  const midfielders = Math.round(remaining * 0.37);
  const attackers = remaining - defenders - midfielders;

  const positions: Position[] = [
    ...Array.from({ length: goalkeepers }, () => Position.GK),
    ...Array.from({ length: defenders }, () => choice(DEF_POSITIONS)),
    ...Array.from({ length: midfielders }, () => choice(MID_POSITIONS)),
    ...Array.from({ length: attackers }, () => choice(ATT_POSITIONS)),
  ];
  return shuffle(positions);
}

// ─────────────────────────────────────────────────────────────────────────
// Définitions des clubs / équipes
// ─────────────────────────────────────────────────────────────────────────

type TeamCategory = 'young' | 'mid' | 'senior';

interface TeamDefinition {
  name: string;
  category: TeamCategory;
  squadSize: number;
  minAge: number;
  maxAge: number;
}

interface ClubDefinition {
  name: string;
  country: string;
  city: string;
  extraAdminClub: boolean;
  teams: TeamDefinition[];
}

const CLUB_DEFINITIONS: ClubDefinition[] = [
  {
    name: 'FC Les Ormes',
    country: 'France',
    city: 'Saint-Ouen-les-Ormes',
    extraAdminClub: false,
    teams: [
      { name: 'U11', category: 'young', squadSize: 10, minAge: 10, maxAge: 11 },
      { name: 'U15', category: 'mid', squadSize: 12, minAge: 14, maxAge: 15 },
      {
        name: 'Seniors',
        category: 'senior',
        squadSize: 14,
        minAge: 18,
        maxAge: 34,
      },
    ],
  },
  {
    name: 'AS Vallée Verte',
    country: 'France',
    city: 'Vallée-Verte',
    extraAdminClub: false,
    teams: [
      { name: 'U10', category: 'young', squadSize: 10, minAge: 9, maxAge: 10 },
      { name: 'U13', category: 'mid', squadSize: 12, minAge: 12, maxAge: 13 },
      {
        name: 'Seniors',
        category: 'senior',
        squadSize: 14,
        minAge: 18,
        maxAge: 34,
      },
    ],
  },
  {
    name: 'Racing Club du Lac',
    country: 'France',
    city: 'Port-du-Lac',
    extraAdminClub: true,
    teams: [
      { name: 'U12', category: 'young', squadSize: 11, minAge: 11, maxAge: 12 },
      { name: 'U16', category: 'mid', squadSize: 13, minAge: 15, maxAge: 16 },
      {
        name: 'Seniors',
        category: 'senior',
        squadSize: 15,
        minAge: 18,
        maxAge: 34,
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Dates de référence (calculées relativement à "maintenant" à l'exécution)
// ─────────────────────────────────────────────────────────────────────────

const NOW = new Date();
// La saison ACTIVE doit être bien entamée (pas juste commencée) pour que le
// championnat — qui démarre 30 jours après le début de saison — ait
// réellement des rencontres passées à marquer FINISHED, pas seulement des
// SCHEDULED futures. ~200 jours de recul place "aujourd'hui" à ~70% de la
// saison, cohérent avec une saison européenne classique (août→juin) déjà bien
// avancée.
const ARCHIVED_SEASON_END = addDays(NOW, -200);
const ARCHIVED_SEASON_START = addDays(ARCHIVED_SEASON_END, -300);
const ACTIVE_SEASON_START = addDays(ARCHIVED_SEASON_END, 1);
const ACTIVE_SEASON_END = addDays(ACTIVE_SEASON_START, 300);
const DRAFT_SEASON_START = addDays(ACTIVE_SEASON_END, 1);
const DRAFT_SEASON_END = addDays(DRAFT_SEASON_START, 300);

function seasonLabel(start: Date, end: Date): string {
  return `Saison ${start.getFullYear()}-${end.getFullYear()}`;
}

function birthDateForAge(minAge: number, maxAge: number): Date {
  const age = randInt(minAge, maxAge);
  const date = addDays(NOW, -age * 365 - randInt(0, 364));
  return date;
}

// ─────────────────────────────────────────────────────────────────────────
// Historique joueur — mesures, évaluation, notes, objectifs, absences,
// entretien ("cohérent dans le temps")
// ─────────────────────────────────────────────────────────────────────────

async function createMeasurementHistory(
  playerId: number,
  category: TeamCategory,
) {
  const timestamps = randInt(2, 3);
  const [baseHeight, baseWeight] =
    category === 'young'
      ? [140, 35]
      : category === 'mid'
        ? [160, 50]
        : [175, 68];

  const rows: {
    playerId: number;
    type: MeasurementType;
    value: number;
    date: Date;
  }[] = [];
  for (let i = 0; i < timestamps; i += 1) {
    const monthsAgo = (timestamps - 1 - i) * randInt(2, 4);
    const date = addDays(NOW, -monthsAgo * 30 - randInt(0, 10));
    const growth = i * randInt(1, 3);
    rows.push({
      playerId,
      type: MeasurementType.HEIGHT,
      value: baseHeight + growth + randInt(-3, 3),
      date,
    });
    rows.push({
      playerId,
      type: MeasurementType.WEIGHT,
      value: baseWeight + growth * 0.5 + randInt(-2, 2),
      date,
    });
  }
  await prisma.playerMeasurement.createMany({ data: rows });
}

async function createEvaluationSessions(
  playerId: number,
  evaluatorMemberId: number,
  categories: Awaited<ReturnType<typeof getSystemEvaluationCriteria>>,
) {
  const sessionCount = chance(0.3) ? 2 : 1;
  const scoreValues = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

  for (let i = 0; i < sessionCount; i += 1) {
    const monthsAgo = (sessionCount - 1 - i) * randInt(2, 3) + randInt(0, 1);
    const date = addDays(NOW, -monthsAgo * 30 - randInt(0, 10));
    const evaluation = await prisma.playerEvaluation.create({
      data: {
        playerId,
        date,
        evaluatorId: evaluatorMemberId,
        comments:
          i === sessionCount - 1
            ? 'Bonne progression générale, continuer les efforts.'
            : undefined,
      },
    });
    const scores = categories.flatMap((category) =>
      category.criteria.map((criterion) => ({
        evaluationId: evaluation.id,
        criterionId: criterion.id,
        score: choice(scoreValues),
      })),
    );
    await prisma.playerEvaluationScore.createMany({ data: scores });
  }
}

const NOTE_TEMPLATES: {
  visibility: NoteVisibility;
  title: string;
  content: string;
}[] = [
  {
    visibility: NoteVisibility.PUBLIC,
    title: 'Progrès notable',
    content:
      'Belle évolution ce mois-ci, notamment dans les efforts défensifs.',
  },
  {
    visibility: NoteVisibility.SEMI_PRIVE,
    title: 'Point technique',
    content:
      'Encore un peu juste sur les contrôles orientés, à retravailler en séance individuelle.',
  },
  {
    visibility: NoteVisibility.PRIVE,
    title: 'Suivi interne staff',
    content:
      'Discussion à avoir avec la famille concernant l’assiduité aux entraînements.',
  },
];

async function createNotes(playerId: number, authorMemberId: number) {
  const count = randInt(1, 2);
  const picked = sample(NOTE_TEMPLATES, count);
  await prisma.playerNote.createMany({
    data: picked.map((tpl) => ({
      playerId,
      authorId: authorMemberId,
      visibility: tpl.visibility,
      title: tpl.title,
      content: tpl.content,
    })),
  });
}

const OBJECTIVE_THEMES = [
  ObjectiveTheme.TECHNIQUE,
  ObjectiveTheme.PHYSIQUE,
  ObjectiveTheme.MENTAL,
  ObjectiveTheme.TACTIQUE,
];
const OBJECTIVE_DESCRIPTIONS: Record<ObjectiveTheme, string> = {
  TECHNIQUE: 'Améliorer la précision de la passe longue.',
  PHYSIQUE: 'Développer l’endurance sur les 20 dernières minutes de match.',
  MENTAL: 'Travailler la gestion du stress avant les rencontres importantes.',
  TACTIQUE: 'Mieux se replacer défensivement après une perte de balle.',
};
const OBJECTIVE_STATUSES = [
  ObjectiveStatus.PLANNED,
  ObjectiveStatus.IN_PROGRESS,
  ObjectiveStatus.ACHIEVED,
  ObjectiveStatus.FAILED,
];

async function createObjective(playerId: number, assignedById: number) {
  const theme = choice(OBJECTIVE_THEMES);
  const startDate = addDays(NOW, -randInt(30, 90));
  await prisma.playerObjective.create({
    data: {
      playerId,
      assignedById,
      theme,
      description: OBJECTIVE_DESCRIPTIONS[theme],
      horizon: choice([
        ObjectiveHorizon.SHORT_TERM,
        ObjectiveHorizon.MID_TERM,
        ObjectiveHorizon.LONG_TERM,
      ]),
      status: choice(OBJECTIVE_STATUSES),
      startDate,
      dueDate: addDays(startDate, randInt(60, 180)),
    },
  });
}

const ABSENCE_REASONS = [
  AbsenceReason.INJURY,
  AbsenceReason.ILLNESS,
  AbsenceReason.VACATION,
  AbsenceReason.OTHER,
];
const ABSENCE_DESCRIPTIONS: Record<AbsenceReason, string> = {
  INJURY: 'Douleur musculaire signalée après le dernier entraînement.',
  ILLNESS: 'Grippe saisonnière, avis médical de repos.',
  VACATION: 'Absence prévue pour vacances familiales.',
  OTHER: 'Contrainte personnelle communiquée au club.',
};

async function createAbsence(playerId: number, reportedById: number) {
  const reason = choice(ABSENCE_REASONS);
  const startDate = addDays(NOW, randInt(-60, 30));
  const byCoach = chance(0.6);
  await prisma.playerAbsence.create({
    data: {
      playerId,
      reason,
      description: ABSENCE_DESCRIPTIONS[reason],
      startDate,
      endDate: addDays(startDate, randInt(1, 10)),
      isExcused: byCoach ? chance(0.7) : null,
      reportedById: byCoach ? reportedById : undefined,
    },
  });
}

async function createInterview(playerId: number, staffMemberId: number) {
  const isFuture = chance(0.25);
  const date = isFuture
    ? addDays(NOW, randInt(5, 45))
    : addDays(NOW, -randInt(10, 120));
  await prisma.playerInterview.create({
    data: {
      playerId,
      staffId: staffMemberId,
      date,
      subject: 'Bilan individuel',
      summary: isFuture
        ? 'Entretien programmé pour faire le point avant la seconde partie de saison.'
        : 'Échange sur la progression, les axes de travail et le ressenti du joueur.',
      staffFeedback: isFuture
        ? undefined
        : 'Investissement sérieux, marge de progression sur la constance.',
      staffAssessment: isFuture
        ? undefined
        : 'Potentiel confirmé, à responsabiliser progressivement.',
      playerFeedback: isFuture
        ? undefined
        : 'Se sent bien intégré, souhaite plus de temps de jeu.',
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Événements — entraînements récurrents + matchs/autres uniques
// ─────────────────────────────────────────────────────────────────────────

async function createTeamEvents(teamId: number, opponents: string[]) {
  // Récurrents : entraînements 2×/semaine (mardi, jeudi) sur ~14 semaines
  // autour d'aujourd'hui (mélange passé/futur), un seul recurringGroupId.
  const recurringGroupId = randomUUID();
  const trainingDays = [2, 4]; // 0=dimanche ... mardi=2, jeudi=4
  const trainingRows: {
    teamId: number;
    type: EventType;
    title: string;
    startAt: Date;
    endAt: Date;
    isRecurring: boolean;
    recurringGroupId: string;
  }[] = [];
  for (let week = -7; week <= 7; week += 1) {
    for (const weekday of trainingDays) {
      const monday = addDays(NOW, week * 7 - NOW.getDay() + 1);
      const day = addDays(monday, weekday - 1);
      const start = new Date(day);
      start.setHours(18, 0, 0, 0);
      const end = new Date(day);
      end.setHours(19, 30, 0, 0);
      trainingRows.push({
        teamId,
        type: EventType.TRAINING,
        title: 'Entraînement',
        startAt: start,
        endAt: end,
        isRecurring: true,
        recurringGroupId,
      });
    }
  }
  await prisma.event.createMany({ data: trainingRows });

  // Uniques : quelques matchs (titre lié aux adversaires du championnat) +
  // 1-2 "autres" événements.
  const matchRows = opponents.slice(0, 6).map((opponent, idx) => {
    const day = addDays(NOW, (idx - 3) * 18 + randInt(-3, 3));
    const start = new Date(day);
    start.setHours(choice([10, 15, 16]), 0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 2);
    return {
      teamId,
      type: EventType.MATCH,
      title: `Match — vs ${opponent}`,
      startAt: start,
      endAt: end,
      isRecurring: false,
    };
  });
  await prisma.event.createMany({ data: matchRows });
}

async function createClubWideEvents(anchorTeamId: number) {
  await prisma.event.createMany({
    data: [
      {
        teamId: anchorTeamId,
        type: EventType.OTHER,
        title: 'Assemblée générale du club',
        startAt: (() => {
          const d = addDays(NOW, 25);
          d.setHours(19, 0, 0, 0);
          return d;
        })(),
        isRecurring: false,
      },
      {
        teamId: anchorTeamId,
        type: EventType.OTHER,
        title: 'Tournoi amical inter-clubs',
        startAt: (() => {
          const d = addDays(NOW, 55);
          d.setHours(9, 0, 0, 0);
          return d;
        })(),
        isRecurring: false,
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Championnat — participants + rencontres round-robin
// ─────────────────────────────────────────────────────────────────────────

const STANDARD_UEFA_TIEBREAKERS = [
  'GOAL_DIFFERENCE',
  'GOALS_SCORED',
  'HEAD_TO_HEAD_POINTS',
  'HEAD_TO_HEAD_GOAL_DIFF',
];

async function createChampionshipForTeam(
  seasonId: number,
  teamId: number,
  teamName: string,
  externalTeamIds: number[],
): Promise<string[]> {
  const championshipStart = addDays(ACTIVE_SEASON_START, 30);
  const championshipEnd = addDays(ACTIVE_SEASON_END, -30);

  const championship = await prisma.championship.create({
    data: {
      seasonId,
      teamId,
      name: `Championnat Régional ${teamName}`,
      startDate: championshipStart,
      endDate: championshipEnd,
      tiebreakerRules: STANDARD_UEFA_TIEBREAKERS,
      tiebreakerPreset: 'Standard UEFA',
    },
  });

  const ownParticipant = await prisma.championshipParticipant.create({
    data: { championshipId: championship.id, internalTeamId: teamId },
  });
  const opponentParticipants = await Promise.all(
    externalTeamIds.map((externalTeamId) =>
      prisma.championshipParticipant.create({
        data: { championshipId: championship.id, externalTeamId },
      }),
    ),
  );

  const allParticipants = [ownParticipant, ...opponentParticipants];
  const pairs: [number, number][] = [];
  for (let i = 0; i < allParticipants.length; i += 1) {
    for (let j = i + 1; j < allParticipants.length; j += 1) {
      pairs.push([allParticipants[i].id, allParticipants[j].id]);
    }
  }

  const totalSpanDays = Math.round(
    (championshipEnd.getTime() - championshipStart.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const matchRows = shuffle(pairs).map(([homeId, awayId], idx) => {
    const dayOffset = Math.round(
      ((idx + 1) / (pairs.length + 1)) * totalSpanDays,
    );
    const scheduledAt = addDays(championshipStart, dayOffset);
    scheduledAt.setHours(15, 0, 0, 0);
    const isPast = scheduledAt < NOW;
    const swapped = chance(0.5);
    return {
      championshipId: championship.id,
      homeParticipantId: swapped ? awayId : homeId,
      awayParticipantId: swapped ? homeId : awayId,
      scheduledAt,
      status: isPast ? ('FINISHED' as const) : ('SCHEDULED' as const),
      scoreHome: isPast ? randInt(0, 5) : undefined,
      scoreAway: isPast ? randInt(0, 5) : undefined,
      round: idx + 1,
    };
  });
  await prisma.championshipMatch.createMany({ data: matchRows });

  return resolveExternalTeamNames(externalTeamIds);
}

async function resolveExternalTeamNames(ids: number[]): Promise<string[]> {
  const teams = await prisma.externalTeam.findMany({
    where: { id: { in: ids } },
  });
  return teams.map((t) => t.name);
}

// ─────────────────────────────────────────────────────────────────────────
// Construction d'un club complet
// ─────────────────────────────────────────────────────────────────────────

interface TeamContext {
  teamId: number;
  name: string;
  category: TeamCategory;
  coachMemberId: number;
  coachEmail: string;
  players: {
    memberId: number;
    playerId: number;
    firstName: string;
    lastName: string;
  }[];
}

async function buildClub(
  clubDef: ClubDefinition,
  roles: Awaited<ReturnType<typeof getSystemRoles>>,
  evaluationCategories: Awaited<ReturnType<typeof getSystemEvaluationCriteria>>,
) {
  const club = await prisma.club.create({
    data: {
      name: clubDef.name,
      country: clubDef.country,
      city: clubDef.city,
      sport: 'FOOTBALL',
    },
  });
  await createClubEvaluationConfig(club.id, evaluationCategories);

  // AdminClub
  const adminGender = randomGender();
  const adminFirst = firstNameFor(adminGender);
  const adminLast = choice(LAST_NAMES);
  const admin = await createMember({
    clubId: club.id,
    firstName: adminFirst,
    lastName: adminLast,
    gender: adminGender,
    birthDate: birthDateForAge(30, 55),
    withLogin: true,
    accountMeta: { role: 'AdminClub', club: clubDef.name },
  });
  await assignMemberRole(admin.id, roles.AdminClub.id, { clubId: club.id });

  if (clubDef.extraAdminClub) {
    const g2 = randomGender();
    const f2 = firstNameFor(g2);
    const l2 = choice(LAST_NAMES);
    const admin2 = await createMember({
      clubId: club.id,
      firstName: f2,
      lastName: l2,
      gender: g2,
      birthDate: birthDateForAge(30, 55),
      withLogin: true,
      accountMeta: {
        role: 'AdminClub',
        club: clubDef.name,
        notes: 'Second administrateur du club',
      },
    });
    await assignMemberRole(admin2.id, roles.AdminClub.id, { clubId: club.id });
  }

  // Saisons
  await prisma.season.create({
    data: {
      clubId: club.id,
      name: seasonLabel(ARCHIVED_SEASON_START, ARCHIVED_SEASON_END),
      startDate: ARCHIVED_SEASON_START,
      endDate: ARCHIVED_SEASON_END,
      status: 'ARCHIVED',
    },
  });
  const activeSeason = await prisma.season.create({
    data: {
      clubId: club.id,
      name: seasonLabel(ACTIVE_SEASON_START, ACTIVE_SEASON_END),
      startDate: ACTIVE_SEASON_START,
      endDate: ACTIVE_SEASON_END,
      status: 'ACTIVE',
    },
  });
  await prisma.season.create({
    data: {
      clubId: club.id,
      name: seasonLabel(DRAFT_SEASON_START, DRAFT_SEASON_END),
      startDate: DRAFT_SEASON_START,
      endDate: DRAFT_SEASON_END,
      status: 'DRAFT',
    },
  });
  // Pool d'équipes externes du club
  const externalTeamNames = nextExternalTeamNames(clubDef.teams.length * 4);
  const externalTeams = await Promise.all(
    externalTeamNames.map((name) =>
      prisma.externalTeam.create({ data: { clubId: club.id, name } }),
    ),
  );

  const teamContexts: TeamContext[] = [];

  for (const teamDef of clubDef.teams) {
    const team = await prisma.team.create({
      data: { clubId: club.id, name: teamDef.name },
    });

    // Staff — 1 Principal, + Adjoint pour l'équipe "mid" (1 équipe sur 3)
    const coachGender = randomGender();
    const coachFirst = firstNameFor(coachGender);
    const coachLast = choice(LAST_NAMES);
    const coach = await createMember({
      clubId: club.id,
      firstName: coachFirst,
      lastName: coachLast,
      gender: coachGender,
      birthDate: birthDateForAge(28, 60),
      withLogin: true,
      accountMeta: {
        role: 'Coach (Principal)',
        club: clubDef.name,
        team: teamDef.name,
      },
    });
    await assignMemberRole(coach.id, roles.Coach.id, {
      clubId: club.id,
      teamId: team.id,
    });
    await prisma.teamStaff.create({
      data: {
        teamId: team.id,
        memberId: coach.id,
        staffRole: TeamStaffRole.PRINCIPAL,
        startDate: addDays(NOW, -randInt(180, 700)),
      },
    });

    if (teamDef.category === 'mid') {
      const adjGender = randomGender();
      const adjFirst = firstNameFor(adjGender);
      const adjLast = choice(LAST_NAMES);
      const adjoint = await createMember({
        clubId: club.id,
        firstName: adjFirst,
        lastName: adjLast,
        gender: adjGender,
        birthDate: birthDateForAge(25, 55),
        withLogin: true,
        accountMeta: {
          role: 'Coach (Adjoint)',
          club: clubDef.name,
          team: teamDef.name,
        },
      });
      await assignMemberRole(adjoint.id, roles.Coach.id, {
        clubId: club.id,
        teamId: team.id,
      });
      await prisma.teamStaff.create({
        data: {
          teamId: team.id,
          memberId: adjoint.id,
          staffRole: TeamStaffRole.ADJOINT,
          startDate: addDays(NOW, -randInt(60, 400)),
        },
      });
    }

    // Joueurs
    const positions = assignPositions(teamDef.squadSize);
    const jerseyNumbers = shuffle(
      Array.from({ length: teamDef.squadSize }, (_, i) => i + 1),
    );
    const players: TeamContext['players'] = [];
    const loginPlayerIndexes = new Set(
      sample(
        Array.from({ length: teamDef.squadSize }, (_, i) => i),
        2,
      ),
    );
    // Accordé au PREMIER parent créé dans l'équipe (pas un index de joueur
    // fixé à l'avance, qui pourrait n'avoir aucun parent selon la probabilité
    // par catégorie) — garantit un login Parent par équipe dès qu'au moins un
    // parent est créé.
    let parentLoginGranted = false;

    for (let i = 0; i < teamDef.squadSize; i += 1) {
      const gender = randomGender();
      const firstName = firstNameFor(gender);
      const lastName = choice(LAST_NAMES);
      const withLogin = loginPlayerIndexes.has(i);
      const playerMember = await createMember({
        clubId: club.id,
        firstName,
        lastName,
        gender,
        birthDate: birthDateForAge(teamDef.minAge, teamDef.maxAge),
        withLogin,
        accountMeta: { role: 'Player', club: clubDef.name, team: teamDef.name },
      });
      await assignMemberRole(playerMember.id, roles.Player.id, {
        clubId: club.id,
        teamId: team.id,
      });

      const profile = await prisma.playerProfile.create({
        data: {
          memberId: playerMember.id,
          nationality: 'France',
          preferredFoot: choice([Foot.RIGHT, Foot.RIGHT, Foot.LEFT, Foot.BOTH]),
        },
      });
      await prisma.playerTeam.create({
        data: {
          playerId: profile.id,
          teamId: team.id,
          jerseyNumber: jerseyNumbers[i],
          mainPosition: positions[i],
          joinDate: addDays(NOW, -randInt(60, 600)),
        },
      });

      players.push({
        memberId: playerMember.id,
        playerId: profile.id,
        firstName,
        lastName,
      });

      // Historique cohérent dans le temps
      await createMeasurementHistory(profile.id, teamDef.category);
      await createEvaluationSessions(
        profile.id,
        coach.id,
        evaluationCategories,
      );
      if (chance(0.5)) await createNotes(profile.id, coach.id);
      if (chance(0.5)) await createObjective(profile.id, coach.id);
      if (chance(0.2)) await createAbsence(profile.id, coach.id);
      const interviewProbability = teamDef.category === 'young' ? 0.15 : 0.4;
      if (chance(interviewProbability))
        await createInterview(profile.id, coach.id);

      // Parent lié (probabilité par catégorie), MemberRole(Parent, teamId)
      const parentProbability =
        teamDef.category === 'young'
          ? 0.9
          : teamDef.category === 'mid'
            ? 0.3
            : 0;
      if (chance(parentProbability)) {
        const parentGender = randomGender();
        const shareLastName = chance(0.7);
        const parentFirst = firstNameFor(parentGender);
        const withParentLogin = !parentLoginGranted;
        if (withParentLogin) parentLoginGranted = true;
        const parent = await createMember({
          clubId: club.id,
          firstName: parentFirst,
          lastName: shareLastName ? lastName : choice(LAST_NAMES),
          gender: parentGender,
          birthDate: birthDateForAge(teamDef.minAge + 20, teamDef.minAge + 35),
          withLogin: withParentLogin,
          accountMeta: {
            role: 'Parent',
            club: clubDef.name,
            team: teamDef.name,
            notes: `Parent de ${firstName} ${lastName}`,
          },
        });
        await assignMemberRole(parent.id, roles.Parent.id, {
          clubId: club.id,
          teamId: team.id,
        });
        await prisma.parentChild.create({
          data: { parentMemberId: parent.id, childMemberId: playerMember.id },
        });
      }
    }

    teamContexts.push({
      teamId: team.id,
      name: teamDef.name,
      category: teamDef.category,
      coachMemberId: coach.id,
      // Toujours défini : le coach principal est créé avec `withLogin: true` ci-dessus.
      coachEmail: coach.email!,
      players,
    });

    // Championnat de cette équipe (saison active), 3-4 adversaires du pool
    const opponentIds = sample(externalTeams, randInt(3, 4)).map((t) => t.id);
    const opponentNames = await createChampionshipForTeam(
      activeSeason.id,
      team.id,
      team.name,
      opponentIds,
    );

    // Événements de l'équipe
    await createTeamEvents(team.id, opponentNames);
  }

  // Événements "club" (rattachés à la première équipe, faute de concept
  // club-wide dans le schéma Event actuel)
  await createClubWideEvents(teamContexts[0].teamId);

  return { club, teamContexts };
}

// ─────────────────────────────────────────────────────────────────────────
// Scénarios multi-rôles (Racing Club du Lac) — cumul Parent/Parent et
// Coach/Parent, comme les personas des tests d'intégration existants
// ─────────────────────────────────────────────────────────────────────────

async function createMultiRoleScenarios(
  roles: Awaited<ReturnType<typeof getSystemRoles>>,
  racingClub: {
    club: { id: number; name: string };
    teamContexts: TeamContext[];
  },
) {
  const [young, mid] = racingClub.teamContexts; // U12, U16

  // Parent avec deux enfants dans deux équipes différentes.
  const childInYoung = young.players[0];
  const childInMid = mid.players[0];
  const parentGender = randomGender();
  const parent = await createMember({
    clubId: racingClub.club.id,
    firstName: firstNameFor(parentGender),
    lastName: childInYoung.lastName,
    gender: parentGender,
    birthDate: birthDateForAge(35, 50),
    withLogin: true,
    accountMeta: {
      role: 'Parent (2 enfants)',
      club: racingClub.club.name,
      team: `${young.name} + ${mid.name}`,
      notes: `Parent de ${childInYoung.firstName} ${childInYoung.lastName} (${young.name}) et de ${childInMid.firstName} ${childInMid.lastName} (${mid.name})`,
    },
  });
  await assignMemberRole(parent.id, roles.Parent.id, {
    clubId: racingClub.club.id,
    teamId: young.teamId,
  });
  await assignMemberRole(parent.id, roles.Parent.id, {
    clubId: racingClub.club.id,
    teamId: mid.teamId,
  });
  await prisma.parentChild.create({
    data: { parentMemberId: parent.id, childMemberId: childInYoung.memberId },
  });
  await prisma.parentChild.create({
    data: { parentMemberId: parent.id, childMemberId: childInMid.memberId },
  });

  // Coach d'une équipe ET Parent d'un enfant d'une autre équipe.
  const seniorsTeam = racingClub.teamContexts[2];
  const childOfCoach = young.players[1];
  await assignMemberRole(seniorsTeam.coachMemberId, roles.Parent.id, {
    clubId: racingClub.club.id,
    teamId: young.teamId,
  });
  await prisma.parentChild.create({
    data: {
      parentMemberId: seniorsTeam.coachMemberId,
      childMemberId: childOfCoach.memberId,
    },
  });
  demoAccounts.push({
    email: seniorsTeam.coachEmail,
    role: 'Coach Seniors + Parent (multi-rôles)',
    club: racingClub.club.name,
    team: `Seniors (Coach) / ${young.name} (Parent)`,
    notes: `Coach de Seniors, aussi Parent de ${childOfCoach.firstName} ${childOfCoach.lastName} en ${young.name}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Documentation des comptes de démo
// ─────────────────────────────────────────────────────────────────────────

function writeAccountsDoc() {
  const platform = demoAccounts.filter((a) => a.club === '—');
  const byClub = new Map<string, DemoAccount[]>();
  for (const account of demoAccounts) {
    if (account.club === '—') continue;
    if (!byClub.has(account.club)) byClub.set(account.club, []);
    byClub.get(account.club)!.push(account);
  }

  let content = `# Comptes de démo — base de développement

> **Données de développement uniquement — jamais en production.** Tous les comptes utilisent le
> même mot de passe, volontairement faible, réservé aux environnements de dev/démo locaux :
>
> **Mot de passe : \`${DEFAULT_PASSWORD}\`**
>
> Fichier généré automatiquement par \`backend/prisma/seed-dev-data.ts\` — écrasé à chaque
> exécution du script. Ne pas modifier à la main.

## Comptes plateforme

| Email | Rôle | Notes |
|---|---|---|
`;
  for (const a of platform) {
    content += `| ${a.email} | ${a.role} | ${a.notes ?? ''} |\n`;
  }

  for (const [club, accounts] of byClub) {
    content += `\n## ${club}\n\n| Email | Mot de passe | Rôle | Équipe | Notes |\n|---|---|---|---|---|\n`;
    for (const a of accounts) {
      content += `| ${a.email} | ${DEFAULT_PASSWORD} | ${a.role} | ${a.team ?? '—'} | ${a.notes ?? ''} |\n`;
    }
  }

  const outPath = join(__dirname, '..', '..', 'docs', 'dev-seed-accounts.md');
  writeFileSync(outPath, content, 'utf-8');
  console.log(`\n✓ Comptes de démo documentés dans ${outPath}`);
}

// ─────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  await assertSystemDataPresent();
  const roles = await getSystemRoles();
  const evaluationCategories = await getSystemEvaluationCriteria();

  await createPlatformAccounts(roles);

  const builtClubs: {
    club: { id: number; name: string };
    teamContexts: TeamContext[];
  }[] = [];
  for (const clubDef of CLUB_DEFINITIONS) {
    const built = await buildClub(clubDef, roles, evaluationCategories);
    builtClubs.push(built);
    console.log(
      `✓ Club "${clubDef.name}" créé (${built.teamContexts.length} équipes).`,
    );
  }

  const racingClub = builtClubs[2];
  await createMultiRoleScenarios(roles, racingClub);

  writeAccountsDoc();

  const totalPlayers = builtClubs.reduce(
    (sum, c) => sum + c.teamContexts.reduce((s, t) => s + t.players.length, 0),
    0,
  );
  const totalTeams = builtClubs.reduce(
    (sum, c) => sum + c.teamContexts.length,
    0,
  );
  console.log('\n─── Résumé ───');
  console.log(`Clubs : ${builtClubs.length}`);
  console.log(`Équipes : ${totalTeams}`);
  console.log(`Joueurs : ${totalPlayers}`);
  console.log(`Comptes de démo (avec login) : ${demoAccounts.length}`);
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
