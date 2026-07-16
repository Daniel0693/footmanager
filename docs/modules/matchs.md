# Module — Matchs

## Principe de conception

`Match` est une extension **1–1** de l'entité générique `Event` du calendrier (un événement
de type `MATCH` possède une fiche `Match` associée). Ce choix réutilise toute la mécanique du
calendrier (création, filtres, code couleur, convocations).

Un `Match` peut être lié à un `ChampionshipMatch` (si c'est un match de championnat) via
`Match.championshipMatchId`. Voir `docs/modules/saisons-championnats.md` pour la règle de
source de vérité sur le score.

Entités associées (détail des champs : `docs/schema/evenements.md`) :
- `Match` — fiche du match de notre équipe
- `MatchPeriod` — gestion des périodes (live)
- `MatchLineup` — composition
- `MatchEvent` — événements live (buts, cartons, remplacements...)
- `MatchAttendance` — convocations et présences
- `MatchPlayerRating` — évaluations individuelles post-match

---

## Format de jeu — configurable par catégorie

Le nombre de périodes et leur durée ne sont pas fixés à 2×45 minutes. Ils sont hérités du
`Championship` associé (`Championship.numberOfPeriods`, `Championship.periodDurationMinutes`)
et peuvent être écrasés sur un `Match` individuel si nécessaire.

Exemples :
- Seniors : 2 × 45 min
- Juniors suisses (certaines catégories) : 4 × 20 min
- Toute autre configuration : entièrement configurable

---

## Cycle de vie d'un match

### 1. Création / préparation (avant le match)

**Deux chemins de création selon `matchType`** (décision actée le 2026-07-16, voir
`docs/roadmap.md` Phase 4 et `docs/schema/evenements.md` §Match) :
- `COUPE`/`AMICAL`/`TOURNOI` : l'entraîneur crée directement un événement de type `MATCH` depuis
  le Calendrier — date, heure, lieu, type, domicile/extérieur, et adversaire choisi dans la liste
  `ExternalTeam` du club (existante ou créée à la volée, même composant que le module
  Championnat). Si `COUPE`, la phase de la compétition (`cupRound` — 64e/32e/16e de finale,
  quart, demi, finale) est également saisie. Backend : `POST clubs/:clubId/teams/:teamId/matches`
  (`MatchesService.create`, A2) — crée l'`Event`+`Match` en une seule transaction, rejette
  explicitement `matchType = CHAMPIONNAT` (code `MATCHES.CHAMPIONNAT_NOT_DIRECT`). Même route pour
  lire/modifier/supprimer n'importe quel `matchType` (championnat inclus) une fois créé ;
  l'adversaire/la phase/le domicile-extérieur d'un match `CHAMPIONNAT` restent en lecture seule
  (`MATCHES.OPPONENT_NOT_EDITABLE`), dérivés du `ChampionshipMatch`.
- `CHAMPIONNAT` : **jamais créé directement depuis le Calendrier**. Naît de la création d'un
  `ChampionshipMatch` dans le module Championnat (existant depuis la Phase 3) — celui-ci crée
  automatiquement l'`Event`+`Match` liés en une transaction, uniquement si l'une de nos équipes
  participe à la rencontre (une rencontre entre deux adversaires n'a pas de fiche match pour
  nous). Le Calendrier affiche ensuite ce match, sans permettre de le recréer.

  Implémenté en A3 (`ChampionshipMatchesService.createLinkedMatchIfOwnTeamInvolved`, appelé par
  `create` et `createBulk`) : `Event.title` = nom de l'adversaire uniquement (jamais de texte en
  dur type "vs"/"Match contre" — le back ne compose jamais de texte traduit, voir
  `docs/architecture.md` §3) ; `homeOrAway` dérivé de la position de notre équipe parmi les deux
  participants. `ChampionshipMatchesService.update` répercute un changement de `scheduledAt` sur
  l'`Event.startAt` lié (le reste — titre/lieu/description — n'a pas d'équivalent sur
  `ChampionshipMatch`, rien à répercuter). `remove` supprime le `Match`+`Event` lié avant la
  rencontre elle-même, pour ne jamais laisser de fiche match orpheline. **Le statut n'est
  volontairement pas synchronisé** entre `ChampionshipMatchStatus` et `LiveMatchStatus` — la
  clôture d'un match live (Partie C) reste l'unique flux qui fait passer un `Match` à `FINISHED`.

**Convocations** : sélection des joueurs convoqués depuis l'effectif (statut `PENDING` dans
`MatchAttendance`). Les joueurs/parents répondent (`ACCEPTED`/`DECLINED`). Le signalement visuel
des joueurs blessés (`Injury.status = EN_COURS`) est **hors scope de la Phase 4** — `Injury`
n'existe pas avant la Phase 8, ce point y est reporté explicitement (confirmé avec l'utilisateur
le 2026-07-16).

**Composition** (`MatchLineup`) : onze de départ, remplaçants, non-convoqués.

---

### 2. Match en live

#### Lancement et gestion des périodes

Le coach clique **"Lancer la période 1"**. Le serveur enregistre `MatchPeriod.startedAt`
(timestamp serveur, pas côté client). La minute affichée dans l'UI est **toujours recalculée
côté client** : `Math.floor((now - period.startedAt) / 60)`. Si l'app est fermée et rouverte,
la minute repart correctement depuis le timestamp serveur.

Flux complet pour 2×45 min :
1. Coach → "Lancer période 1" → `MatchPeriod(periodNumber=1, startedAt=T1)`
2. Coach → "Fin période 1" → `MatchPeriod(endedAt=T2)`, `Match.status = HALFTIME`
3. Coach → "Lancer période 2" → `MatchPeriod(periodNumber=2, startedAt=T3)`
4. Coach → "Fin période 2" → `MatchPeriod(endedAt=T4)`, `Match.status = FINISHED`

Pour 4×20 min, le même flux s'applique avec 4 `MatchPeriod`. L'UI affiche le numéro de période
en cours. **MVP : un seul utilisateur gère le live** (l'app ne gère pas la concurrence en temps
réel avant une phase ultérieure).

#### Événements live (`MatchEvent`)

| Type | `playerId` (notre joueur) | `relatedPlayerId` | `externalPlayerId` |
|---|---|---|---|
| `GOAL` (notre équipe) | Buteur | Passeur décisif (nullable) | — |
| `OWN_GOAL` (notre équipe) | Auteur | — | — |
| `GOAL` (adversaire) | — | — | Buteur adverse (nullable) |
| `YELLOW_CARD` (notre joueur) | Joueur cartonné | — | — |
| `YELLOW_CARD` (adversaire) | — | — | Joueur adverse (nullable) |
| `RED_CARD` (notre joueur) | Joueur cartonné | — | — |
| `RED_CARD` (adversaire) | — | — | Joueur adverse (nullable) |
| `SUBSTITUTION` | Joueur entrant | Joueur sortant | — |
| `PENALTY_SCORED` | Tireur | — | — |
| `PENALTY_MISSED` | Tireur | — | — |

**L'assist n'est pas un événement séparé** : c'est `relatedPlayerId` sur l'événement `GOAL`.
Cela évite d'avoir un assist sans but correspondant et simplifie les requêtes de statistiques.

Chaque `MatchEvent` porte aussi :
- `periodNumber` : dans quelle période l'événement s'est produit.
- `minute` : calculé ou saisi manuellement.
- `teamSide` : `HOME` ou `AWAY`.

#### Clôture du match

À la fin de la dernière période, le coach clique **"Clore le match"** :
1. `Match.status` passe à `FINISHED`.
2. Le score est calculé depuis les `MatchEvent` de type `GOAL`/`OWN_GOAL` et écrit sur :
   - `ChampionshipMatch.scoreHome/Away` si c'est un match de championnat.
   - `Match.scoreHome/Away` si c'est un match amical.
3. Le classement du championnat est actualisé à la prochaine requête (calculé à la volée).

**Correction post-match** : l'entraîneur peut corriger un score ou ajouter un événement manqué.
Le score est recalculable à tout moment depuis les événements.

---

### 3. Après le match

- **Présences effectives** : confirmer/corriger les `AttendanceStatus`.
- **Évaluation collective** : `Match.globalRating` (sur 10) + `Match.globalComment`.
- **Évaluations individuelles** (`MatchPlayerRating`) : note sur 10 + commentaire par joueur.

---

## Statistiques calculées depuis `MatchEvent`

Toutes les stats individuelles sont calculées à la volée, jamais stockées en colonnes
dénormalisées. Sources de calcul :

| Statistique | Calcul |
|---|---|
| Buts d'un joueur | `COUNT(MatchEvent) WHERE type=GOAL AND playerId=X` |
| Passes décisives d'un joueur | `COUNT(MatchEvent) WHERE type=GOAL AND relatedPlayerId=X` |
| Cartons jaunes | `COUNT(MatchEvent) WHERE type=YELLOW_CARD AND playerId=X` |
| Cartons rouges | `COUNT(MatchEvent) WHERE type=RED_CARD AND playerId=X` |
| Temps de jeu | Titulaire : début période 1 → substitution sortie (ou fin de match). Remplaçant : substitution entrée → fin de match. Calculé depuis `MatchPeriod` + `MatchEvent SUBSTITUTION`. |
| Moyenne de notes | `AVG(MatchPlayerRating.score) WHERE playerId=X` |

Ces statistiques sont filtrables par `Season`, `Championship`, ou toutes périodes confondues.

---

## Droits par rôle

| Action | Coach (son équipe) | AdminClub | SuperAdmin / Propriétaire | Player | Parent |
|---|---|---|---|---|---|
| Créer / modifier un match | ✅ | ✅ | ✅ | ❌ | ❌ |
| Préparer la composition | ✅ | ❌ | ✅ | ❌ | ❌ |
| Gérer le live (périodes + événements) | ✅ | ❌ | ✅ | ❌ | ❌ |
| Clore le match | ✅ | ❌ | ✅ | ❌ | ❌ |
| Répondre à une convocation | ❌ | ❌ | ❌ | ✅ (le sien) | ✅ (son enfant) |
| Saisir présences effectives | ✅ | ❌ | ✅ | ❌ | ❌ |
| Évaluation collective + individuelle | ✅ | ❌ | ✅ | ❌ | ❌ |
| Voir la fiche match complète | ✅ | ✅ | ✅ | ✅ (résultat + sa note) | ✅ (résultat) |
| Supprimer un match | ✅ | ✅ | ✅ | ❌ | ❌ |

**Parent** : les droits « son enfant » ci-dessus s'appuient désormais sur la liaison `ParentChild`
et le scope `PermissionScope.PARENT` (décision ouverte #5, tranchée — voir
`docs/modules/auth-roles.md` §Rôle Parent), câblés dès l'étape A0 de la Phase 4. Un Parent n'a
droit **qu'au résultat** du match de son enfant (`match READ PARENT`) et à répondre à sa
convocation (`match_attendance READ`/`UPDATE PARENT`) — pas à la composition, aux événements de
match ni à l'évaluation individuelle, plus restrictif que le scope `OWN` de l'enfant lui-même
(Player). Cohérent avec la posture déjà adoptée sur `championship` en Phase 3 (Parent volontairement
tenu à l'écart des sous-ressources non essentielles).

**Permissions scindées en 6 ressources distinctes** (`match`, `match_lineup`, `match_period`,
`match_event`, `match_attendance`, `match_player_rating`), pas une seule `match` globale — la
table de droits ci-dessus mélange des actions qu'un seul rôle générique ne peut pas exprimer :
AdminClub a un droit complet sur la fiche `match` (créer/modifier/supprimer) mais seulement la
**lecture** sur toutes les sous-ressources (composition, live, présences, évaluation) —
contrairement à Coach/SuperAdmin qui ont le CRUD complet sur tout. Voir `backend/prisma/seed.ts`
pour le détail par rôle (étape A0, Phase 4).

---

## Lien avec les autres modules

- **Calendrier** : le match est un `Event`, affiché avec le code couleur approprié.
- **Championnat** : `Match.championshipMatchId` → `ChampionshipMatch`. Score de référence sur
  `ChampionshipMatch`. Mise à jour du classement à la clôture.
- **Effectif** : `MatchPlayerRating` et `MatchEvent` enrichissent le profil joueur (stats,
  dashboard).
- **Blessures** : joueurs blessés signalés lors de la préparation de la composition.
- **Scouting** : un `TeamScoutingReport` ou `PlayerScoutingReport` peut être rattaché à un
  `ChampionshipMatch` (`championshipMatchId` nullable, optionnel). Voir `docs/schema/scouting.md`.
