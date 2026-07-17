# Schéma — Événements (Calendrier, Entraînement, Matchs)

> Tout ce qui s'affiche dans le calendrier et les activités de l'équipe.
> `Event` est l'entité parente. `TrainingSession` et `Match` l'étendent en relation 1–1.

---

## Event — Événement générique du calendrier

Entité parente de tout ce qui apparaît dans le calendrier. Permet un affichage unifié avec
filtres et code couleur par type.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `teamId` | FK → Team | |
| `type` | enum `EventType` | |
| `title` | String | |
| `startAt` | DateTime | |
| `endAt` | DateTime, nullable | |
| `location` | String, nullable | |
| `description` | Text, nullable | |
| `isRecurring` | Boolean, défaut `false` | |
| `recurringGroupId` | UUID, nullable | voir "Événements récurrents" ci-dessous |

**Événements récurrents (2026-07-08)** : pas d'entité `RecurringRule`. Le frontend calcule la
liste concrète des dates d'occurrence à la validation du formulaire (règle hebdomadaire,
mensuelle ou annuelle — voir `docs/modules/calendrier-evenements.md`) et le backend crée chaque
occurrence comme un `Event` indépendant via `EventsService.createBulk` (`isRecurring = true`,
`recurringGroupId` = même UUID généré une fois par lot, partagé par toutes les occurrences de ce
lot). Pas de règle vivante réévaluée dynamiquement : `recurringGroupId` sert uniquement à
retrouver "cet événement et les suivants" pour une édition ou suppression en masse
(`scope=single|future` sur `PATCH`/`DELETE .../events/:id`) — jamais les occurrences passées par
rapport à celle éditée/supprimée. En scope `future`, seuls titre/type/lieu/description/heure se
propagent aux occurrences suivantes ; la date de chacune est préservée (même convention que
Google Calendar "cet événement et les suivants").

---

## TrainingSession — Séance d'entraînement

Extension **1–1** d'un `Event` de type `TRAINING`.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `eventId` | FK → Event, **unique** | |
| `theme` | String, nullable | ex. "technique", "physique", "tactique" |
| `globalRating` | Decimal(4,1), nullable | **sur 10** — note globale de la séance |
| `globalComment` | Text, nullable | compte-rendu général de la séance |

---

## Exercise — Exercice de la bibliothèque

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `createdById` | FK → Member | |
| `clubId` | FK → Club, nullable | `null` = bibliothèque personnelle ; non-null = bibliothèque club |
| `title` | String | |
| `description` | Text, nullable | objectifs, consignes |
| `tags` | String[] | ex. ["technique", "U15", "finition"] |
| `schemaData` | Json, nullable | données de l'éditeur graphique (positions, flèches) |

---

## TrainingSessionExercise — Exercices d'une séance (ordonnés)

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `trainingSessionId` | FK → TrainingSession | |
| `exerciseId` | FK → Exercise | |
| `order` | Int | ordre d'exécution dans la séance |
| `durationMinutes` | Int, nullable | |

---

## TrainingAttendance — Présence à une séance

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `trainingSessionId` | FK → TrainingSession | |
| `playerId` | FK → PlayerProfile | |
| `status` | enum `AttendanceStatus` | voir `index.md` |
| `confirmedByParent` | Boolean, défaut `false` | joueur sans compte propre |

---

## TrainingFeedback — Feedback post-séance du joueur

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `trainingSessionId` | FK → TrainingSession | |
| `playerId` | FK → PlayerProfile | |
| `content` | Text | |
| `rating` | Decimal(4,1), nullable | **sur 10** — note de la séance par le joueur |
| `submittedAt` | DateTime | |
| `editableUntil` | DateTime, nullable | défini par l'entraîneur. Après cette date : verrouillé sauf pour l'entraîneur |

---

## Match — Fiche de match de notre équipe

Extension **1–1** d'un `Event` de type `MATCH`. Schéma implémenté en Phase 4 (A1, 2026-07-16) —
décisions actées avant l'implémentation, voir `docs/modules/matchs.md` et `docs/roadmap.md`.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `eventId` | FK → Event, **unique** | |
| `championshipMatchId` | FK → ChampionshipMatch, nullable, **unique** | non-null seulement si `matchType = CHAMPIONNAT` — seule FK réelle de cette relation 1–1, voir `ChampionshipMatch` ci-dessous |
| `matchType` | enum `MatchType` (4 valeurs) | |
| `opponentExternalTeamId` | FK → ExternalTeam, nullable | **remplace le `opponentName: String` initialement envisagé** — non-null seulement si `matchType != CHAMPIONNAT` (adversaire choisi dans la liste `ExternalTeam` du club, existante ou créée à la volée). Pour `CHAMPIONNAT`, l'adversaire est dérivé du `ChampionshipParticipant` opposé dans `ChampionshipMatch`, jamais stocké ici |
| `cupRound` | enum `CupRound`, nullable | non-null seulement si `matchType = COUPE` — phase de la compétition (voir enum ci-dessous), pas de bracket/entité de compétition dédiée (décision MVP) |
| `homeOrAway` | enum `HomeOrAway` | pour `CHAMPIONNAT`, dérivé à la création depuis la position de notre équipe dans `ChampionshipMatch` ; pour les 3 autres types, choisi par le Coach |
| `status` | enum `LiveMatchStatus` | |
| `numberOfPeriods` | Int, nullable | écrase le défaut du Championship si renseigné |
| `periodDurationMinutes` | Int, nullable | idem |
| `gameFormat` | enum `GameFormat`, nullable | format de jeu (nombre de joueurs, Phase 4 B10) — écrase celui du Championship pour un match CHAMPIONNAT si renseigné ; pré-rempli depuis `Team.category` à la création pour les 3 autres types, toujours modifiable. Voir `docs/schema/fondations.md` §Team et `docs/modules/matchs.md` §Format de jeu |
| `scoreHome` | Int, nullable | **null si `championshipMatchId` est non-null** |
| `scoreAway` | Int, nullable | **null si `championshipMatchId` est non-null** |
| `globalRating` | Decimal(4,1), nullable | **sur 10** — performance collective |
| `globalComment` | Text, nullable | compte-rendu post-match |
| `formation` | String, nullable | système tactique choisi pour la composition (ex. `"4-3-3"`, décision du 2026-07-17) — chaîne libre, pas un enum Prisma : la liste des formations disponibles (`frontend/src/lib/formations.ts`) est une préoccupation d'affichage, aucune table de correspondance dupliquée côté backend |

**Règle de score** : si `championshipMatchId` est non-null, le score de référence est sur
`ChampionshipMatch`. `Match.scoreHome/Away` restent null. Enforced au niveau applicatif
(`MatchesService`), même approche que les autres contraintes "exactement l'un des deux" du
projet (ex. `ChampionshipParticipant`).

**`CupRound`** — comptée en nombre d'équipes encore en lice (convention anglaise standard), pas en
nombre de matchs restants (convention française) :

```prisma
enum CupRound {
  ROUND_OF_128   // 128 équipes — "64e de finale"
  ROUND_OF_64    // 64 équipes — "32e de finale"
  ROUND_OF_32    // 32 équipes — "16e de finale"
  ROUND_OF_16    // 16 équipes — "8e de finale" (huitièmes)
  QUARTER_FINAL  // 8 équipes — "quart de finale"
  SEMI_FINAL     // 4 équipes — "demi-finale"
  FINAL          // 2 équipes — "finale"
}
```

Corrigé le 2026-07-16 (retour utilisateur, A4) : la version initiale avait décalé les libellés
d'un cran (`ROUND_OF_64` étiqueté "64e de finale" au lieu de "32e de finale"), ce qui faisait
disparaître la "16e de finale" de la liste. `ROUND_OF_128` ajouté pour couvrir le premier tour
standard sans perdre la "64e de finale".

**Sens de création selon `matchType`** (docs/modules/matchs.md) :
- `CHAMPIONNAT` : jamais créé directement — naît d'un `ChampionshipMatch` (module Championnat),
  qui crée l'`Event`+`Match` en transaction, uniquement si l'une de nos équipes y participe.
- `COUPE`/`AMICAL`/`TOURNOI` : créé directement depuis le Calendrier, adversaire choisi via
  `ExternalTeam` (liste existante ou création à la volée).

---

## MatchPeriod — Périodes du match (gestion live)

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `matchId` | FK → Match | |
| `periodNumber` | Int | 1, 2, 3, 4... selon le format |
| `startedAt` | DateTime, nullable | **timestamp serveur** au clic "Lancer période N" |
| `endedAt` | DateTime, nullable | **timestamp serveur** au clic "Fin période N" |

La minute affichée dans l'UI est calculée côté client :
`Math.floor((now - period.startedAt) / 60)`.
Robuste aux fermetures d'onglet et aux changements d'appareil.

Flux pour 2×45 min : `MatchPeriod(1, start)` → `MatchPeriod(1, end)` → `Match.status=HALFTIME`
→ `MatchPeriod(2, start)` → `MatchPeriod(2, end)` → `Match.status=FINISHED`.
Identique pour 4×20 min avec 4 `MatchPeriod`.

**Contrainte** : unicité sur `(matchId, periodNumber)` — une seule ligne par période et par
match (Phase 4, Partie C, C0).

**MVP** : un seul utilisateur gère le live. Multi-utilisateur en temps réel : phase ultérieure.

---

## MatchLineup — Composition de l'équipe

Schéma implémenté en Phase 4 (Partie B, B0, 2026-07-17).

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `matchId` | FK → Match | |
| `playerId` | FK → PlayerProfile | |
| `lineupStatus` | enum `LineupStatus` | `NON_CONVOQUE` utilisé depuis B8 pour marquer un joueur présent/accepté mais volontairement écarté du match (ex. surnuméraire) — distinct de "pas encore traité" (aucune ligne) |
| `position` | enum `Position`, nullable | poste joué pour ce match — peut différer de `PlayerTeam.mainPosition` (ex. dépannage), jamais lu depuis `PlayerTeam` |
| `pitchSpotId` | String, nullable | point précis sur le terrain SVG, relatif à la formation choisie sur `Match.formation` (ex. `"def-left"`, décision du 2026-07-17 ; référentiel remplacé en B8 par `frontend/src/lib/formations.ts`, voir note plus bas) — jamais dupliqué côté backend (pure préoccupation d'affichage) ; distinct de `position` car deux joueurs peuvent partager le même poste (2 `CB`) tout en occupant chacun un point différent |
| `shirtNumber` | Int, nullable | idem, peut différer de `PlayerTeam.jerseyNumber` |
| `isCaptain` | Boolean, défaut `false` | au plus un par match — invariant maintenu par `MatchLineupsService` (pas de contrainte SQL, un index partiel n'est pas exprimable dans le DSL Prisma), jamais par un autre point d'entrée. Décision du 2026-07-17 : réservé aux titulaires (`pitchSpotId` non nul) |

**Contraintes** : unicité sur `(matchId, playerId)` — une seule ligne de composition par joueur et
par match ; unicité sur `(matchId, pitchSpotId)` — deux joueurs ne peuvent jamais occuper le même
point du terrain sur un même match (les remplaçants, `pitchSpotId = null`, ne sont jamais en
conflit entre eux : PostgreSQL traite plusieurs `NULL` comme distincts dans une contrainte unique).

---

## MatchEvent — Événements du match (live et post-match)

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `matchId` | FK → Match | |
| `type` | enum `MatchEventType` | |
| `teamSide` | enum `TeamSide` | voir `index.md` |
| `periodNumber` | Int, nullable | dans quelle période |
| `minute` | Int, nullable | |
| `playerId` | FK → PlayerProfile, nullable | **notre joueur** : buteur, cartonné, joueur entrant (sub) |
| `relatedPlayerId` | FK → PlayerProfile, nullable | **passeur décisif** (GOAL), **joueur sortant** (SUBSTITUTION) |
| `externalPlayerId` | FK → ExternalPlayer, nullable | joueur adverse impliqué |
| `comment` | String, nullable | |

**L'assist n'est pas un événement séparé** : c'est `relatedPlayerId` sur l'événement `GOAL`.
Calcul : `COUNT(MatchEvent WHERE type=GOAL AND relatedPlayerId=X)` = assists du joueur X.

**`externalPlayerId` reste nullable même pour un événement adverse** (`teamSide=AWAY`, retour
utilisateur du 2026-07-18) : un but/carton adverse doit pouvoir être enregistré sans nommer de
joueur précis (équipe/joueurs non suivis) — l'événement reste alors global au niveau de l'équipe
adverse, sans forcer un choix dans `ExternalPlayer` (`docs/schema/championnats.md`
§ExternalPlayer).

| Type d'événement | `playerId` | `relatedPlayerId` | `externalPlayerId` |
|---|---|---|---|
| GOAL (notre équipe) | Buteur | Passeur décisif (nullable) | — |
| OWN_GOAL | Auteur | — | — |
| GOAL (adverse) | — | — | Buteur adverse (nullable) |
| YELLOW/RED_CARD (notre joueur) | Joueur cartonné | — | — |
| YELLOW/RED_CARD (adverse) | — | — | Joueur adverse (nullable) |
| SUBSTITUTION | Joueur **entrant** | Joueur **sortant** | — |
| PENALTY_SCORED / MISSED | Tireur | — | — |

**Temps de jeu** calculé depuis les `MatchEvent SUBSTITUTION` croisés avec `MatchPeriod` :
titulaire → de début de période 1 à substitution sortie (ou fin de match) ;
remplaçant → de substitution entrée à fin de match.

---

## MatchAttendance — Convocations et présences au match

Schéma implémenté en Phase 4 (Partie B, B0, 2026-07-17). `convocationStatus` posé par le Coach à
la création (toujours `PENDING`), modifié ensuite par le joueur/parent concerné
(`ACCEPTED`/`DECLINED`) — jamais par le Coach. `attendanceStatus` renseigné le jour J (présences
effectives), par le Coach uniquement.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `matchId` | FK → Match | |
| `playerId` | FK → PlayerProfile | |
| `convocationStatus` | enum `ConvocationStatus`, défaut `PENDING` | voir `index.md` |
| `attendanceStatus` | enum `AttendanceStatus`, nullable | renseigné le jour J |

**Contrainte** : unicité sur `(matchId, playerId)` — une seule convocation par joueur et par
match.

---

## MatchPlayerRating — Évaluation individuelle post-match

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `matchId` | FK → Match | |
| `playerId` | FK → PlayerProfile | |
| `evaluatorId` | FK → Member | coach qui note |
| `score` | Decimal(4,1) | **sur 10** |
| `comment` | Text, nullable | |

**Contrainte** : unicité sur `(matchId, playerId, evaluatorId)`.

---

## Enums

```prisma
enum EventType {
  TRAINING
  MATCH
  OTHER
}

enum MatchType {
  CHAMPIONNAT
  COUPE
  AMICAL
  TOURNOI
}

enum HomeOrAway {
  HOME
  AWAY
}

enum LiveMatchStatus {
  SCHEDULED
  LIVE
  HALFTIME
  FINISHED
  CANCELLED
  POSTPONED
}

enum LineupStatus {
  TITULAIRE
  REMPLACANT
  NON_CONVOQUE
}

enum MatchEventType {
  GOAL
  OWN_GOAL
  YELLOW_CARD
  RED_CARD
  SUBSTITUTION
  PENALTY_SCORED
  PENALTY_MISSED
}
```

---

## Statistiques calculées

Toutes les statistiques sont calculées à la volée depuis les événements. Pas de colonnes
dénormalisées en MVP.

| Statistique | Source de calcul |
|---|---|
| Buts | `COUNT(MatchEvent WHERE type=GOAL AND playerId=X)` |
| Passes décisives | `COUNT(MatchEvent WHERE type=GOAL AND relatedPlayerId=X)` |
| Cartons jaunes | `COUNT(MatchEvent WHERE type=YELLOW_CARD AND playerId=X)` |
| Cartons rouges | `COUNT(MatchEvent WHERE type=RED_CARD AND playerId=X)` |
| Temps de jeu | `MatchPeriod` + `MatchEvent SUBSTITUTION` |
| Taux de présence | `TrainingAttendance` + `MatchAttendance` |
| Moyenne de notes | `AVG(MatchPlayerRating.score WHERE playerId=X)` |

---

## Index

```
@@unique([eventId])                               sur TrainingSession, Match
@@unique([trainingSessionId, playerId])           sur TrainingAttendance, TrainingFeedback
@@unique([matchId, playerId, evaluatorId])        sur MatchPlayerRating
@@unique([matchId, playerId])                     sur MatchAttendance, MatchLineup
@@index([matchId])                                sur MatchPeriod, MatchLineup, MatchEvent, MatchAttendance
@@index([playerId])                               sur TrainingAttendance, TrainingFeedback, MatchPlayerRating
@@index([teamId, startAt])                        sur Event
@@index([recurringGroupId])                       sur Event
```
