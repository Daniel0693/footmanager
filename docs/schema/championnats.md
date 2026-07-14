# Schéma — Championnats (Saisons, Compétitions, Équipes externes)

> Tout ce qui concerne la structure compétitive : saisons, championnats, classements,
> et les entités externes (équipes et joueurs adverses non-utilisateurs de FootManager).

---

## Season — Saison du club

Cadre temporel **partagé par tout le club** (révision A14, docs/roadmap.md — initialement
scopée équipe, déplacée au niveau club car toutes les équipes d'un club suivent le même
calendrier de saisons). Une simple tranche de dates, sans logique de roster attachée : `Team`
peut avoir 1..N `Championship` rattachés à une `Season` (chaque équipe joue son propre
championnat au sein de la même saison partagée — voir note Championship ci-dessous).

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `clubId` | FK → Club | |
| `name` | String | ex. "Saison 2024–2025", "Automne 2024" |
| `startDate` | Date | |
| `endDate` | Date | |
| `status` | enum `SeasonStatus` | |

**Contraintes** (applicatives, `SeasonsService`) :
- Une seule `Season` avec `status = ACTIVE` par `Club` à tout instant.
- Deux `Season` d'un même club ne peuvent jamais avoir de plages de dates qui se chevauchent,
  quel que soit leur `status` (y compris entre une saison ARCHIVED et une nouvelle).

**Gestion réservée à AdminClub/SuperAdmin/Proprietaire** — Coach et Player n'ont que la lecture
(`season READ` scope `TEAM`, transmis via `?teamId=`, la route `clubs/:clubId/seasons` ne
portant pas de `:teamId` — voir `docs/modules/auth-roles.md` §"Patterns découverts").

**Pas de wizard, pas de logique de roster** : création/édition via une modale simple
(nom + dates), activation via une action ponctuelle (bouton + confirmation) sur la fiche de
saison. `PlayerTeam` n'a pas de FK directe vers `Season` — les mouvements de joueurs entre
équipes (départs, arrivées, promotions de catégorie, ex. U15→U16) se gèrent au fil de l'eau via
l'Effectif (y compris l'assignation d'un joueur déjà existant dans le club à une nouvelle
équipe, sans re-création de son profil — voir `docs/modules/effectif-joueurs.md`), jamais via
un wizard de transition de saison. Détail complet : `docs/modules/saisons-championnats.md`.

---

## Championship — Championnat dans une saison

> **À trancher au démarrage de la Partie B** (pas encore construite) : depuis la révision A14,
> `Season` est club-wide et n'a plus de lien direct avec une équipe précise. Un `Championship`
> devra donc porter **son propre `teamId`** en plus de `seasonId` (chaque équipe joue son propre
> championnat au sein de la même saison partagée — ex. Championnat U15 ≠ Championnat U16 sur la
> saison 2026-2027), et rien n'empêchera plusieurs `Championship` pour la même équipe sur la
> même saison (ex. U15 : "Championnat d'Automne" ET "Championnat du Printemps", cas réel en
> Suisse signalé par l'utilisateur — pas de contrainte d'unicité `teamId`+`seasonId`). Les
> Coachs créent leurs championnats eux-mêmes (permission déjà prévue `TEAM` CRUD, voir
> `docs/roadmap.md` Partie B §B0), de façon récurrente et découplée de la création de la saison
> — pas de wizard reliant les deux. Le tableau ci-dessous reflète encore la conception d'origine
> (avant A14) et sera mis à jour au moment de l'implémentation.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `seasonId` | FK → Season | |
| `name` | String | ex. "Championnat Printemps 2025 U15" |
| `startDate` | Date | défini librement par l'utilisateur |
| `endDate` | Date | |
| `pointsForWin` | Int, défaut `3` | |
| `pointsForDraw` | Int, défaut `1` | |
| `pointsForLoss` | Int, défaut `0` | |
| `tiebreakerRules` | Json | tableau ordonné de `TiebreakerRule` — ex. `["GOAL_DIFFERENCE","GOALS_SCORED"]` |
| `tiebreakerPreset` | String, nullable | label du preset choisi (affichage uniquement) |
| `numberOfPeriods` | Int, défaut `2` | format de jeu par défaut pour ce championnat |
| `periodDurationMinutes` | Int, défaut `45` | durée d'une période en minutes |

**Règles de départage disponibles (`TiebreakerRule`)** :
```
GOAL_DIFFERENCE · GOALS_SCORED · GOALS_CONCEDED · WINS
HEAD_TO_HEAD_POINTS · HEAD_TO_HEAD_GOAL_DIFF · HEAD_TO_HEAD_GOALS_SCORED
AWAY_GOALS · RANDOM
```

**FAIR_PLAY exclu du MVP** : points de pénalité gérés par la fédération, non calculables
automatiquement. Post-MVP : saisie manuelle sur la fiche équipe du championnat.

---

## ChampionshipParticipant — Équipe dans un championnat

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `championshipId` | FK → Championship | |
| `internalTeamId` | FK → Team, nullable | notre équipe (utilisatrice de FootManager) |
| `externalTeamId` | FK → ExternalTeam, nullable | équipe adverse |

**Contrainte applicative** : exactement l'un des deux doit être non-null.

---

## ChampionshipMatch — Rencontre dans le championnat

Couvre **toutes** les rencontres du championnat : les nôtres et les matchs entre adversaires.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `championshipId` | FK → Championship | |
| `homeParticipantId` | FK → ChampionshipParticipant | |
| `awayParticipantId` | FK → ChampionshipParticipant | |
| `scheduledAt` | DateTime | |
| `scoreHome` | Int, nullable | source de vérité du score pour le classement |
| `scoreAway` | Int, nullable | |
| `status` | enum `ChampionshipMatchStatus` | |
| `matchId` | FK → Match, nullable | lien vers notre `Match` si l'une des équipes est interne |
| `round` | Int, nullable | journée / tour numéroté |
| `numberOfPeriods` | Int, nullable | écrase le défaut du Championship pour ce match |
| `periodDurationMinutes` | Int, nullable | idem |

**Règle de score — source de vérité unique** :

| Type de match | Score stocké sur |
|---|---|
| Match amical (`championshipMatchId` null) | `Match.scoreHome/Away` |
| Match de championnat (`championshipMatchId` non-null) | `ChampionshipMatch.scoreHome/Away` → `Match.scoreHome/Away` = NULL |

À la clôture d'un match live, le score est calculé depuis les `MatchEvent GOAL/OWN_GOAL`
et écrit sur `ChampionshipMatch` (jamais sur `Match` dans ce contexte).

**Classement calculé à la volée** : agréger les `ChampionshipMatch` terminés, trier par points,
appliquer `tiebreakerRules` dans l'ordre. Pas de table `Standing` en MVP.
Voir `docs/modules/saisons-championnats.md` pour l'algorithme complet.

---

## ExternalTeam — Équipe adverse

Scopée au **Club** (pas au Championship). Créée une fois, réutilisable d'une saison à l'autre.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `clubId` | FK → Club | club FootManager qui a créé cet adversaire |
| `name` | String | |
| `city` | String, nullable | |
| `country` | String, nullable | |
| `notes` | Text, nullable | |

---

## ExternalPlayer — Joueur d'une équipe adverse

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `externalTeamId` | FK → ExternalTeam, **nullable** | null si équipe inconnue au moment de la création |
| `name` | String | |
| `position` | enum `Position`, nullable | poste habituel — voir `index.md` |
| `shirtNumber` | Int, nullable | |
| `notes` | Text, nullable | |
| `isActive` | Boolean, défaut `true` | false si le joueur a quitté l'équipe |

**`externalTeamId` nullable** : un joueur peut être créé sans équipe connue (vu en tournoi).
L'équipe est assignable plus tard — tous les rapports existants en bénéficient automatiquement.

**Note RGPD** : données personnelles de joueurs tiers (non-utilisateurs). Limiter aux
informations strictement nécessaires (nom, poste, numéro) — pas de données sensibles.

---

## Enums

```prisma
enum SeasonStatus {
  DRAFT     // en préparation, saison précédente toujours ACTIVE
  ACTIVE    // saison courante (une seule par club)
  ARCHIVED  // saison terminée, données consultables et modifiables
}

enum ChampionshipMatchStatus {
  SCHEDULED
  FINISHED
  CANCELLED
  POSTPONED
}

// TiebreakerRule est stockée en Json (tableau ordonné) sur Championship.
// Valeurs possibles documentées dans le champ championship.tiebreakerRules ci-dessus.
```

---

## Index

```
@@index([clubId, status])           sur Season (trouver rapidement la ACTIVE d'un club)
@@index([seasonId])                 sur Championship
@@index([championshipId])           sur ChampionshipParticipant, ChampionshipMatch
@@index([clubId])                   sur ExternalTeam
@@index([externalTeamId])           sur ExternalPlayer
```
