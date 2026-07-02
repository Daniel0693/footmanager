# Module — Matchs

## Principe de conception

`Match` est une extension **1–1** de l'entité générique `Event` du calendrier (un événement
de type `MATCH` possède une fiche `Match` associée). Ce choix réutilise toute la mécanique du
calendrier (création, filtres, code couleur, convocations).

Un `Match` peut être lié à un `ChampionshipMatch` (si c'est un match de championnat) via
`Match.championshipMatchId`. Voir `docs/modules/saisons-championnats.md` pour la règle de
source de vérité sur le score.

Entités associées (détail des champs : `docs/schema-bdd.md` §13 et §24) :
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

L'entraîneur crée un événement de type `MATCH` dans le calendrier. Informations à saisir :
date, heure, lieu, type (`OFFICIEL`, `AMICAL`, `TOURNOI`), adversaire, domicile/extérieur.

**Convocations** : sélection des joueurs convoqués depuis l'effectif (statut `PENDING` dans
`MatchAttendance`). Les joueurs/parents répondent (`ACCEPTED`/`DECLINED`). Les joueurs avec
une `Injury.status = EN_COURS` sont signalés visuellement.

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

---

## Lien avec les autres modules

- **Calendrier** : le match est un `Event`, affiché avec le code couleur approprié.
- **Championnat** : `Match.championshipMatchId` → `ChampionshipMatch`. Score de référence sur
  `ChampionshipMatch`. Mise à jour du classement à la clôture.
- **Effectif** : `MatchPlayerRating` et `MatchEvent` enrichissent le profil joueur (stats,
  dashboard).
- **Blessures** : joueurs blessés signalés lors de la préparation de la composition.
- **Scouting** : un `ScoutingReport` peut être rattaché à un `ChampionshipMatch` (optionnel).
