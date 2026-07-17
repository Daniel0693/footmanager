import type { Position } from "@/lib/positions";

// Systèmes tactiques pour la composition d'un match (docs/modules/matchs.md
// §Format de jeu, B8/B10 — décision du 2026-07-17). Un match a un format de
// jeu (`GameFormat` — nombre de joueurs sur le terrain, gardien inclus,
// dérivé de la catégorie d'âge de l'équipe mais toujours modifiable, voir
// `Match.gameFormat`/`Championship.gameFormat`) ; chaque format propose une
// liste de dispositifs tactiques courants (source : tableau fourni par
// l'utilisateur, "Format-Dispositifsfrequentsnonexhaustifs.csv", 2026-07-17).
//
// Chaque dispositif définit exactement (format - 1) points de champ + 1
// point de gardien, sur le même repère que l'ancien référentiel générique
// POSITION_PITCH_SPOTS (viewBox 0-100/0-100, y=0 but adverse, y=100 but du
// gardien) — remplacé depuis B8 par ce système piloté par la formation.
//
// Les identifiants de point ("def-1".."def-5", "mid-1".."mid-6",
// "fwd-1".."fwd-3") sont volontairement génériques et partagés entre tous
// les dispositifs, y compris entre formats différents, plutôt que propres à
// chacun : un joueur affecté à "def-2" reste affecté à "def-2" en changeant
// de dispositif ou de format tant que ce point existe dans la nouvelle
// formation, avec de nouvelles coordonnées automatiquement — c'est ce qui
// permet de "conserver les joueurs compatibles" au changement (voir
// `CompositionColumn.handleFormationChange`) sans logique de correspondance
// ligne/côté : un point qui n'existe plus dans la nouvelle formation renvoie
// simplement son joueur au banc.

export type GameFormat =
  | "FOUR"
  | "FIVE"
  | "SIX"
  | "SEVEN"
  | "EIGHT"
  | "NINE"
  | "ELEVEN";

export const GAME_FORMATS: GameFormat[] = [
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "ELEVEN",
];

// Nombre de joueurs sur le terrain par équipe, gardien inclus.
export const GAME_FORMAT_PLAYER_COUNT: Record<GameFormat, number> = {
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
  ELEVEN: 11,
};

export type FormationLine = "GK" | "DEF" | "MID" | "FWD";

export interface FormationSlot {
  id: string;
  line: FormationLine;
  x: number;
  y: number;
}

export interface Formation {
  id: string;
  gameFormat: GameFormat;
  slots: FormationSlot[];
}

// Poste "métier" (enum Position, docs/schema/index.md) associé par défaut à
// un point de formation, pour les statistiques (ex. buts par poste) — un
// point générique ("def-2") n'a pas de correspondance exacte avec les 15
// valeurs de l'enum (ex. DC vs DD vs DG), une valeur représentative par
// ligne suffit ici plutôt qu'une table de correspondance fine à maintenir.
export const LINE_TO_POSITION: Record<FormationLine, Position> = {
  GK: "GK",
  DEF: "CB",
  MID: "CM",
  FWD: "ST",
};

// ─────────────────────────────────────────────────────────────────────────
// Construction des dispositifs à partir d'une notation compacte (nombre de
// joueurs par ligne, du fond vers l'attaque, gardien exclu) — évite de saisir
// à la main les coordonnées de chaque point pour ~49 dispositifs.

const Y_GK = 92;

// Répartition verticale des lignes selon le nombre de lignes du dispositif
// (1 à 5 lignes de champ, gardien à part) — du fond (proche du but, y grand)
// vers l'attaque (proche du but adverse, y petit).
const Y_BANDS_BY_LINE_COUNT: Record<number, number[]> = {
  1: [45],
  2: [70, 20],
  3: [75, 45, 15],
  4: [80, 58, 34, 14],
  5: [82, 64, 46, 28, 12],
};

// Répartition horizontale des points d'une ligne selon son effectif.
const X_PRESETS: Record<number, number[]> = {
  1: [50],
  2: [35, 65],
  3: [20, 50, 80],
  4: [12, 38, 62, 88],
  5: [8, 27, 50, 73, 92],
};

// `lineCounts` : effectif de chaque ligne de champ, du fond vers l'attaque,
// gardien EXCLU (toujours ajouté séparément). La première ligne est toujours
// classée DEF, la dernière toujours FWD ; toute ligne intermédiaire (défense
// avancée, milieu défensif/offensif...) est classée MID — assez pour le
// badge affiché sur un point vide et pour `LINE_TO_POSITION`, sans prétendre
// distinguer chaque sous-ligne tactique.
function buildFormation(
  id: string,
  gameFormat: GameFormat,
  lineCounts: number[],
): Formation {
  const yBands = Y_BANDS_BY_LINE_COUNT[lineCounts.length] ?? Y_BANDS_BY_LINE_COUNT[4];
  const counters = { def: 0, mid: 0, fwd: 0 };
  const slots: FormationSlot[] = [{ id: "gk", line: "GK", x: 50, y: Y_GK }];

  lineCounts.forEach((count, lineIndex) => {
    const line: FormationLine =
      lineIndex === 0 ? "DEF" : lineIndex === lineCounts.length - 1 ? "FWD" : "MID";
    const key = line === "DEF" ? "def" : line === "MID" ? "mid" : "fwd";
    const xs = X_PRESETS[count] ?? X_PRESETS[3];
    const y = yBands[lineIndex];
    for (const x of xs) {
      counters[key] += 1;
      slots.push({ id: `${key}-${counters[key]}`, line, x, y });
    }
  });

  return { id, gameFormat, slots };
}

// ─────────────────────────────────────────────────────────────────────────
// Dispositifs par format — couverture complète du CSV fourni (2026-07-17),
// nettoyée des artefacts de récupération web (références "+3"/"footeo" etc.)
// et de la numérotation à gardien explicite de la source ("1-3-3-2" → ligne
// de fond 3, milieu 3, attaque 2). Identifiant SANS le chiffre du gardien
// pour tous les formats, y compris sub-11 (retour utilisateur du
// 2026-07-18 : même convention d'affichage que le 11 contre 11 partout,
// "3-3-2" et non "1-3-3-2") — seul `lineCounts` (passé à `buildFormation`)
// garde le gardien implicite en tête de ligne conceptuelle, jamais dans
// l'identifiant affiché.
//
// Format 4 — 2 des 6 entrées listées ("2-2", "3-1") ne suivent ni la
// convention "gardien explicite" (somme ≠ 4) ni "gardien implicite, reste =
// 3" (somme ≠ 3) : incohérence de la source (déjà signalée "non
// exhaustif"), écartées plutôt que mal interprétées. "1-3" dupliqué dans le
// CSV, dédoublonné.

export const FORMATIONS: Formation[] = [
  // ELEVEN — notation standard sans gardien explicite.
  buildFormation("4-4-2", "ELEVEN", [4, 4, 2]),
  buildFormation("4-1-2-1-2", "ELEVEN", [4, 1, 2, 1, 2]), // 4-4-2 losange
  buildFormation("4-3-3", "ELEVEN", [4, 3, 3]),
  buildFormation("4-2-3-1", "ELEVEN", [4, 2, 3, 1]),
  buildFormation("4-1-4-1", "ELEVEN", [4, 1, 4, 1]),
  buildFormation("4-5-1", "ELEVEN", [4, 5, 1]),
  buildFormation("4-3-1-2", "ELEVEN", [4, 3, 1, 2]),
  buildFormation("4-2-2-2", "ELEVEN", [4, 2, 2, 2]),
  buildFormation("3-5-2", "ELEVEN", [3, 5, 2]),
  buildFormation("3-4-3", "ELEVEN", [3, 4, 3]),
  buildFormation("3-4-1-2", "ELEVEN", [3, 4, 1, 2]),
  buildFormation("3-3-3-1", "ELEVEN", [3, 3, 3, 1]),
  buildFormation("3-2-3-2", "ELEVEN", [3, 2, 3, 2]),
  buildFormation("5-3-2", "ELEVEN", [5, 3, 2]),
  buildFormation("5-4-1", "ELEVEN", [5, 4, 1]),
  buildFormation("5-2-3", "ELEVEN", [5, 2, 3]),

  // NINE
  buildFormation("3-3-2", "NINE", [3, 3, 2]),
  buildFormation("3-2-3", "NINE", [3, 2, 3]),
  buildFormation("4-3-1", "NINE", [4, 3, 1]),
  buildFormation("4-2-2", "NINE", [4, 2, 2]),
  buildFormation("2-3-3", "NINE", [2, 3, 3]),
  buildFormation("3-4-1", "NINE", [3, 4, 1]),
  buildFormation("4-1-3", "NINE", [4, 1, 3]),
  buildFormation("2-4-2", "NINE", [2, 4, 2]),
  buildFormation("2-5-1", "NINE", [2, 5, 1]), // retour utilisateur du 2026-07-18

  // EIGHT
  buildFormation("3-3-1", "EIGHT", [3, 3, 1]),
  buildFormation("2-3-2", "EIGHT", [2, 3, 2]),
  buildFormation("3-2-2", "EIGHT", [3, 2, 2]),
  buildFormation("3-1-2-1", "EIGHT", [3, 1, 2, 1]), // double losange
  buildFormation("2-4-1", "EIGHT", [2, 4, 1]),
  buildFormation("2-2-3", "EIGHT", [2, 2, 3]),

  // SEVEN
  buildFormation("3-1-2", "SEVEN", [3, 1, 2]),
  buildFormation("3-2-1", "SEVEN", [3, 2, 1]),
  buildFormation("3-3", "SEVEN", [3, 3]),
  buildFormation("2-3-1", "SEVEN", [2, 3, 1]),
  buildFormation("2-2-2", "SEVEN", [2, 2, 2]),
  buildFormation("4-1-1", "SEVEN", [4, 1, 1]),

  // SIX
  buildFormation("2-2-1", "SIX", [2, 2, 1]),
  buildFormation("2-1-2", "SIX", [2, 1, 2]),
  buildFormation("1-3-1", "SIX", [1, 3, 1]),
  buildFormation("3-1-1", "SIX", [3, 1, 1]),
  buildFormation("1-2-2", "SIX", [1, 2, 2]),

  // FIVE
  buildFormation("2-1-1", "FIVE", [2, 1, 1]),
  buildFormation("1-2-1", "FIVE", [1, 2, 1]),
  buildFormation("1-1-2", "FIVE", [1, 1, 2]),
  buildFormation("3-1", "FIVE", [3, 1]),
  buildFormation("2-2", "FIVE", [2, 2]),

  // FOUR — voir note ci-dessus (2 entrées de la source écartées).
  buildFormation("3", "FOUR", [3]),
  buildFormation("2-1", "FOUR", [2, 1]),
  buildFormation("1-2", "FOUR", [1, 2]),
];

// Compare deux identifiants de dispositif numéro par numéro (ex. "2-5-1" <
// "3-3-2" < "3-4-1", retour utilisateur du 2026-07-18) plutôt
// qu'alphabétiquement ("10-..." avant "2-..." sinon, non pertinent ici mais
// plus généralement "3-3" ne doit pas être confondu avec le texte "3-30").
function compareFormationIds(a: string, b: string): number {
  const partsA = a.split("-").map(Number);
  const partsB = b.split("-").map(Number);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function getFormationsForGameFormat(gameFormat: GameFormat): Formation[] {
  return FORMATIONS.filter((f) => f.gameFormat === gameFormat).sort((a, b) =>
    compareFormationIds(a.id, b.id),
  );
}

export const DEFAULT_FORMATION_ID: Record<GameFormat, string> = {
  ELEVEN: "4-4-2",
  NINE: "3-3-2",
  EIGHT: "3-3-1",
  SEVEN: "3-1-2",
  SIX: "2-2-1",
  FIVE: "2-1-1",
  FOUR: "3",
};

export function getFormation(id: string | null, gameFormat: GameFormat): Formation {
  const candidates = getFormationsForGameFormat(gameFormat);
  return candidates.find((f) => f.id === id) ?? candidates[0];
}
