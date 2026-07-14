import type { TiebreakerRule } from '../tiebreaker-rule';

// Fonction pure (docs/roadmap.md Partie B §B12) : zéro dépendance Prisma/
// Nest, testable en isolation. Algorithme documenté dans
// docs/modules/saisons-championnats.md §Classement :
// 1. Agréger points/buts/victoires-nuls-défaites par participant.
// 2. Trier par points décroissants → groupes d'égalité.
// 3. Appliquer tiebreakerRules dans l'ordre pour départager chaque groupe,
//    en le subdivisant récursivement à chaque règle.
// 4. HEAD_TO_HEAD_* et AWAY_GOALS : sous-agrégat restreint aux seuls matchs
//    entre les équipes actuellement ex-aequo, jamais l'ensemble du
//    championnat.
// Un groupe encore ex-aequo après épuisement des règles configurées est
// ordonné par participantId (stable, déterministe) — pas d'indicateur
// "toujours ex-aequo" ici, c'est un souci de présentation (B14), pas de
// calcul.

export interface StandingsMatch {
  homeParticipantId: number;
  awayParticipantId: number;
  scoreHome: number;
  scoreAway: number;
}

export interface StandingsRow {
  participantId: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
  goalsConceded: number;
  goalDifference: number;
  points: number;
  rank: number;
}

export interface ComputeStandingsInput {
  participantIds: number[];
  matches: StandingsMatch[];
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  tiebreakerRules: TiebreakerRule[];
  // Injecté pour un résultat déterministe en test (RANDOM, dernier recours).
  rng?: () => number;
}

interface RawStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
  goalsConceded: number;
  points: number;
}

function computeRawStats(
  participantIds: number[],
  matches: StandingsMatch[],
  pointsForWin: number,
  pointsForDraw: number,
  pointsForLoss: number,
): Map<number, RawStats> {
  const stats = new Map<number, RawStats>();
  for (const id of participantIds) {
    stats.set(id, {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsScored: 0,
      goalsConceded: 0,
      points: 0,
    });
  }

  for (const match of matches) {
    const home = stats.get(match.homeParticipantId);
    const away = stats.get(match.awayParticipantId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;
    home.goalsScored += match.scoreHome;
    home.goalsConceded += match.scoreAway;
    away.goalsScored += match.scoreAway;
    away.goalsConceded += match.scoreHome;

    if (match.scoreHome > match.scoreAway) {
      home.wins += 1;
      home.points += pointsForWin;
      away.losses += 1;
      away.points += pointsForLoss;
    } else if (match.scoreHome < match.scoreAway) {
      away.wins += 1;
      away.points += pointsForWin;
      home.losses += 1;
      home.points += pointsForLoss;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += pointsForDraw;
      away.points += pointsForDraw;
    }
  }

  return stats;
}

function computeTiebreakerValues(
  rule: TiebreakerRule,
  group: number[],
  allMatches: StandingsMatch[],
  overallStats: Map<number, RawStats>,
  pointsForWin: number,
  pointsForDraw: number,
  pointsForLoss: number,
  rng: () => number,
): Map<number, number> {
  const values = new Map<number, number>();

  switch (rule) {
    case 'GOAL_DIFFERENCE':
      for (const id of group) {
        const s = overallStats.get(id)!;
        values.set(id, s.goalsScored - s.goalsConceded);
      }
      break;
    case 'GOALS_SCORED':
      for (const id of group) values.set(id, overallStats.get(id)!.goalsScored);
      break;
    case 'GOALS_CONCEDED':
      for (const id of group)
        values.set(id, overallStats.get(id)!.goalsConceded);
      break;
    case 'WINS':
      for (const id of group) values.set(id, overallStats.get(id)!.wins);
      break;
    case 'HEAD_TO_HEAD_POINTS':
    case 'HEAD_TO_HEAD_GOAL_DIFF':
    case 'HEAD_TO_HEAD_GOALS_SCORED': {
      const groupSet = new Set(group);
      const h2hMatches = allMatches.filter(
        (m) =>
          groupSet.has(m.homeParticipantId) &&
          groupSet.has(m.awayParticipantId),
      );
      const h2hStats = computeRawStats(
        group,
        h2hMatches,
        pointsForWin,
        pointsForDraw,
        pointsForLoss,
      );
      for (const id of group) {
        const s = h2hStats.get(id)!;
        if (rule === 'HEAD_TO_HEAD_POINTS') values.set(id, s.points);
        else if (rule === 'HEAD_TO_HEAD_GOAL_DIFF')
          values.set(id, s.goalsScored - s.goalsConceded);
        else values.set(id, s.goalsScored);
      }
      break;
    }
    case 'AWAY_GOALS': {
      const groupSet = new Set(group);
      for (const id of group) values.set(id, 0);
      for (const m of allMatches) {
        if (
          groupSet.has(m.homeParticipantId) &&
          groupSet.has(m.awayParticipantId)
        ) {
          values.set(
            m.awayParticipantId,
            (values.get(m.awayParticipantId) ?? 0) + m.scoreAway,
          );
        }
      }
      break;
    }
    case 'RANDOM':
      for (const id of group) values.set(id, rng());
      break;
  }

  return values;
}

function resolveGroup(
  group: number[],
  rules: TiebreakerRule[],
  allMatches: StandingsMatch[],
  overallStats: Map<number, RawStats>,
  pointsForWin: number,
  pointsForDraw: number,
  pointsForLoss: number,
  rng: () => number,
): number[] {
  if (group.length <= 1) return group;
  if (rules.length === 0) {
    // Toutes les règles configurées sont épuisées, toujours ex-aequo : ordre
    // stable déterministe plutôt qu'un ordre dépendant de l'itération.
    return [...group].sort((a, b) => a - b);
  }

  const [rule, ...restRules] = rules;
  const valueByParticipant = computeTiebreakerValues(
    rule,
    group,
    allMatches,
    overallStats,
    pointsForWin,
    pointsForDraw,
    pointsForLoss,
    rng,
  );

  // GOALS_CONCEDED se départage par ordre croissant (moins de buts encaissés
  // = meilleur classement) — toutes les autres règles sont descendantes.
  const ascending = rule === 'GOALS_CONCEDED';
  const byValue = new Map<number, number[]>();
  for (const id of group) {
    const value = valueByParticipant.get(id)!;
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value)!.push(id);
  }
  const sortedValues = [...byValue.keys()].sort((a, b) =>
    ascending ? a - b : b - a,
  );

  const result: number[] = [];
  for (const value of sortedValues) {
    const subGroup = byValue.get(value)!;
    result.push(
      ...resolveGroup(
        subGroup,
        restRules,
        allMatches,
        overallStats,
        pointsForWin,
        pointsForDraw,
        pointsForLoss,
        rng,
      ),
    );
  }
  return result;
}

export function computeStandings(input: ComputeStandingsInput): StandingsRow[] {
  const {
    participantIds,
    matches,
    pointsForWin,
    pointsForDraw,
    pointsForLoss,
    tiebreakerRules,
    rng = Math.random,
  } = input;

  const overallStats = computeRawStats(
    participantIds,
    matches,
    pointsForWin,
    pointsForDraw,
    pointsForLoss,
  );

  const byPoints = new Map<number, number[]>();
  for (const id of participantIds) {
    const points = overallStats.get(id)!.points;
    if (!byPoints.has(points)) byPoints.set(points, []);
    byPoints.get(points)!.push(id);
  }
  const pointsDesc = [...byPoints.keys()].sort((a, b) => b - a);

  const orderedIds: number[] = [];
  for (const points of pointsDesc) {
    const group = byPoints.get(points)!;
    orderedIds.push(
      ...resolveGroup(
        group,
        tiebreakerRules,
        matches,
        overallStats,
        pointsForWin,
        pointsForDraw,
        pointsForLoss,
        rng,
      ),
    );
  }

  return orderedIds.map((id, index) => {
    const s = overallStats.get(id)!;
    return {
      participantId: id,
      played: s.played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goalsScored: s.goalsScored,
      goalsConceded: s.goalsConceded,
      goalDifference: s.goalsScored - s.goalsConceded,
      points: s.points,
      rank: index + 1,
    };
  });
}
