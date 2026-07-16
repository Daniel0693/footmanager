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
| `scoreHome` | Int, nullable | **null si `championshipMatchId` est non-null** |
| `scoreAway` | Int, nullable | **null si `championshipMatchId` est non-null** |
| `globalRating` | Decimal(4,1), nullable | **sur 10** — performance collective |
| `globalComment` | Text, nullable | compte-rendu post-match |

**Règle de score** : si `championshipMatchId` est non-null, le score de référence est sur
`ChampionshipMatch`. `Match.scoreHome/Away` restent null. Enforced au niveau applicatif
(`MatchesService`), même approche que les autres contraintes "exactement l'un des deux" du
projet (ex. `ChampionshipParticipant`).

**`CupRound`** — comptée en nombre d'équipes encore en lice (convention anglaise standard), pas en
nombre de matchs restants (convention française) :

```prisma
enum CupRound {
  ROUND_OF_64    // 64 équipes — "64e de finale"
  ROUND_OF_32    // 32 équipes — "32e de finale"
  ROUND_OF_16    // 16 équipes — "8e de finale" (huitièmes)
  QUARTER_FINAL  // 8 équipes — "quart de finale"
  SEMI_FINAL     // 4 équipes — "demi-finale"
  FINAL          // 2 équipes — "finale"
}
```

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

**MVP** : un seul utilisateur gère le live. Multi-utilisateur en temps réel : phase ultérieure.

---

## MatchLineup — Composition de l'équipe

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `matchId` | FK → Match | |
| `playerId` | FK → PlayerProfile | |
| `lineupStatus` | enum `LineupStatus` | |
| `position` | enum `Position`, nullable | poste joué pour ce match |
| `shirtNumber` | Int, nullable | |

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

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `matchId` | FK → Match | |
| `playerId` | FK → PlayerProfile | |
| `convocationStatus` | enum `ConvocationStatus` | voir `index.md` |
| `attendanceStatus` | enum `AttendanceStatus`, nullable | renseigné le jour J |

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
@@index([matchId])                                sur MatchPeriod, MatchLineup, MatchEvent, MatchAttendance
@@index([playerId])                               sur TrainingAttendance, TrainingFeedback, MatchPlayerRating
@@index([teamId, startAt])                        sur Event
@@index([recurringGroupId])                       sur Event
```
