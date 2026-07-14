import { computeStandings, type StandingsMatch } from './compute-standings';

const DEFAULT_POINTS = { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 };

function match(
  homeParticipantId: number,
  awayParticipantId: number,
  scoreHome: number,
  scoreAway: number,
): StandingsMatch {
  return { homeParticipantId, awayParticipantId, scoreHome, scoreAway };
}

describe('computeStandings', () => {
  it('classe par points décroissants sans aucune égalité', () => {
    const matches = [
      match(1, 2, 2, 0), // 1 bat 2
      match(2, 3, 1, 1), // 2 nul 3
      match(3, 1, 0, 3), // 1 bat 3
    ];

    const result = computeStandings({
      participantIds: [1, 2, 3],
      matches,
      ...DEFAULT_POINTS,
      tiebreakerRules: ['GOAL_DIFFERENCE'],
    });

    expect(result.map((r) => r.participantId)).toEqual([1, 2, 3]);
    expect(result[0]).toMatchObject({
      participantId: 1,
      played: 2,
      wins: 2,
      draws: 0,
      losses: 0,
      points: 6,
      goalsScored: 5,
      goalsConceded: 0,
      goalDifference: 5,
      rank: 1,
    });
    expect(result[1]).toMatchObject({ participantId: 2, points: 1, rank: 2 });
    expect(result[2]).toMatchObject({ participantId: 3, points: 1, rank: 3 });
  });

  it('égalité à 2 équipes départagée par GOAL_DIFFERENCE', () => {
    // 1 et 2 ont chacun 3 points (une victoire), mais 1 a une meilleure
    // différence de buts.
    const matches = [match(1, 3, 5, 0), match(2, 3, 1, 0), match(1, 2, 0, 0)];

    const result = computeStandings({
      participantIds: [1, 2, 3],
      matches,
      ...DEFAULT_POINTS,
      tiebreakerRules: ['GOAL_DIFFERENCE'],
    });

    expect(result.map((r) => r.participantId)).toEqual([1, 2, 3]);
  });

  it('GOALS_CONCEDED se départage par ordre croissant (moins encaissé = mieux classé)', () => {
    // 1 et 2 à égalité de points (4) et de différence de buts (+2 chacun),
    // mais 1 a encaissé moins de buts que 2. Un 3e participant sert
    // d'adversaire commun, largement battu, sans interférer sur le groupe
    // ex-aequo (0 point, hors groupe).
    const matches = [
      match(1, 3, 2, 0), // 1 bat 3 : marque 2, encaisse 0
      match(2, 3, 3, 1), // 2 bat 3 : marque 3, encaisse 1
      match(1, 2, 1, 1), // nul : 1 et 2 marquent/encaissent 1 chacun
    ];

    const result = computeStandings({
      participantIds: [1, 2, 3],
      matches,
      ...DEFAULT_POINTS,
      tiebreakerRules: ['GOALS_CONCEDED'],
    });

    expect(result[0]).toMatchObject({
      participantId: 1,
      points: 4,
      goalDifference: 2,
      goalsConceded: 1,
    });
    expect(result[1]).toMatchObject({
      participantId: 2,
      points: 4,
      goalDifference: 2,
      goalsConceded: 2,
    });
    expect(result[2].participantId).toBe(3);
  });

  it('égalité à 3 équipes : une règle départage la première, la suivante départage les deux restantes', () => {
    // 1, 2, 3 ont tous 3 points (une victoire chacun, contre un 4e participant
    // neutre). GOAL_DIFFERENCE sépare 1 du reste ; GOALS_SCORED sépare 2 et 3.
    const matches = [
      match(1, 4, 5, 0), // diff +5
      match(2, 4, 2, 0), // diff +2, 2 buts marqués
      match(3, 4, 3, 1), // diff +2, 3 buts marqués
      match(4, 1, 0, 0),
      match(4, 2, 0, 0),
      match(4, 3, 0, 0),
    ];

    const result = computeStandings({
      participantIds: [1, 2, 3, 4],
      matches,
      ...DEFAULT_POINTS,
      tiebreakerRules: ['GOAL_DIFFERENCE', 'GOALS_SCORED'],
    });

    expect(result.map((r) => r.participantId)).toEqual([1, 3, 2, 4]);
  });

  it('HEAD_TO_HEAD_POINTS départage un groupe ex-aequo sur les seuls matchs aller-retour entre eux', () => {
    // 1, 2, 3 ont tous 4 points au global (deux nuls, une victoire chacun
    // face à un adversaire commun). En confrontation directe (aller-retour) :
    // 1 bat 2 et 3, 2 bat 3 → HEAD_TO_HEAD_POINTS : 1=6, 2=3, 3=0.
    const matches = [
      match(1, 2, 2, 0),
      match(2, 1, 0, 1),
      match(1, 3, 2, 0),
      match(3, 1, 0, 1),
      match(2, 3, 2, 0),
      match(3, 2, 0, 1),
    ];

    const result = computeStandings({
      participantIds: [1, 2, 3],
      matches,
      ...DEFAULT_POINTS,
      tiebreakerRules: ['HEAD_TO_HEAD_POINTS'],
    });

    expect(result.map((r) => r.participantId)).toEqual([1, 2, 3]);
    // Le classement global (goalsScored) reste calculé sur TOUS les matchs,
    // pas seulement la confrontation directe.
    expect(result[0].goalsScored).toBe(6);
  });

  it('AWAY_GOALS départage une égalité de points/buts par les buts marqués à l’extérieur', () => {
    // 1 et 2 : chacun un match nul à domicile et un match nul à l'extérieur,
    // mêmes buts marqués/encaissés au total — seule la répartition
    // domicile/extérieur diffère.
    const matches = [
      match(1, 2, 2, 2), // 1 domicile : 2 buts à l'extérieur pour 2
      match(2, 1, 1, 1), // 2 domicile : 1 but à l'extérieur pour 1
    ];

    const result = computeStandings({
      participantIds: [1, 2],
      matches,
      ...DEFAULT_POINTS,
      tiebreakerRules: ['AWAY_GOALS'],
    });

    expect(result.map((r) => r.participantId)).toEqual([2, 1]);
  });

  it('RANDOM départage en dernier recours, de façon déterministe via rng injecté', () => {
    const matches: StandingsMatch[] = [];
    const values = [0.9, 0.1];
    let call = 0;
    const rng = () => values[call++];

    const result = computeStandings({
      participantIds: [1, 2],
      matches,
      ...DEFAULT_POINTS,
      tiebreakerRules: ['RANDOM'],
      rng,
    });

    // participant 1 reçoit 0.9, participant 2 reçoit 0.1 → tri descendant.
    expect(result.map((r) => r.participantId)).toEqual([1, 2]);
  });

  it('reste ex-aequo (ordre stable par id) une fois toutes les règles configurées épuisées', () => {
    const matches: StandingsMatch[] = [];

    const result = computeStandings({
      participantIds: [3, 1, 2],
      matches,
      ...DEFAULT_POINTS,
      tiebreakerRules: ['GOAL_DIFFERENCE'],
    });

    expect(result.map((r) => r.participantId)).toEqual([1, 2, 3]);
  });

  it('égalités multiples successives : plusieurs groupes de 2 à des niveaux de points différents', () => {
    // Groupe A (1,2) à 6 points, groupe B (3,4) à 3 points — chaque groupe
    // doit être départagé indépendamment par GOAL_DIFFERENCE.
    const matches = [
      match(1, 5, 5, 0), // diff +5 pour 1
      match(2, 5, 1, 0), // diff +1 pour 2
      match(1, 6, 1, 0),
      match(2, 6, 1, 0),
      match(3, 5, 0, 0),
      match(4, 5, 0, 0),
      match(3, 6, 2, 1), // diff +1 pour 3
      match(4, 6, 0, 0), // diff 0 pour 4
    ];

    const result = computeStandings({
      participantIds: [1, 2, 3, 4, 5, 6],
      matches,
      ...DEFAULT_POINTS,
      tiebreakerRules: ['GOAL_DIFFERENCE'],
    });

    const ranked = result.map((r) => r.participantId);
    expect(ranked.indexOf(1)).toBeLessThan(ranked.indexOf(2));
    expect(ranked.indexOf(2)).toBeLessThan(ranked.indexOf(3));
    expect(ranked.indexOf(3)).toBeLessThan(ranked.indexOf(4));
  });
});
