# Module — Saisons & Championnats

## Vision

Une `Season` est le cadre temporel d'une équipe sur une période définie. Elle peut contenir
un ou plusieurs `Championship` (championnats distincts). Exemple suisse :

- **Équipe adulte** : une Season "2024–2025" (juillet → juin) contenant un Championship
  "Championnat 2024–2025".
- **Équipe junior suisse** : deux Seasons distinctes — "Automne 2024" et "Printemps 2025" —
  chacune contenant son propre Championship. Ou une Season annuelle contenant deux Championships.
  C'est l'utilisateur qui décide du découpage.

Le nombre de Championships par Season n'est pas limité — le modèle couvre tous les cas selon
les pays et fédérations.

---

## Cycle de vie d'une Season

### États d'une Season

| État | Description |
|---|---|
| `DRAFT` | En cours de préparation. Roster importable, championnats configurables. La saison précédente reste `ACTIVE`. |
| `ACTIVE` | Saison courante de l'équipe. **Une seule par équipe** à tout instant. |
| `ARCHIVED` | Saison terminée. Données consultables et modifiables, mais plus active. |

### Workflow de transition — créer une nouvelle saison

Ce workflow est déclenché par un Coach ou AdminClub depuis la fiche de l'équipe.

**Étape 1 — Créer la nouvelle Season**
- Saisir : nom (ex. "Saison 2025/2026"), `startDate`, `endDate`.
- La Season est créée en état `DRAFT`. La saison actuelle reste `ACTIVE` — les deux coexistent.

**Étape 2 — Importer le roster**
- Le système affiche le roster actif actuel de l'équipe (indépendant de la saison ciblée —
  `PlayerTeam` n'a pas de FK directe vers `Season`, voir `docs/schema/championnats.md`).
- Le coach sélectionne les joueurs à reconduire (tous par défaut, décochables).
- Pour chaque joueur sélectionné : une nouvelle entrée `PlayerTeam` est créée avec
  `joinDate = newSeason.startDate`, liée à la même `Team`, en reportant numéro de maillot et
  poste de son affectation active actuelle (continuité — évite de tout ressaisir).
- **Précision (2026-07-13)** : aucun `leaveDate` n'est posé à cette étape — ni sur l'ancienne
  affectation des joueurs reconduits, ni sur celle des partants (implicites, simplement non
  sélectionnés). Réservé entièrement à l'étape 4, pour que le wizard reste annulable sans effet
  de bord tant qu'il n'est pas validé. Conséquence acceptée : entre l'import et l'activation, un
  joueur reconduit a temporairement deux affectations `PlayerTeam` actives sur la même équipe.
- Nouveaux joueurs (arrivées / transferts) : ajoutés manuellement à ce stade ou plus tard.

**Étape 3 — Configurer les championnats (optionnel à ce stade)**
- Créer les `Championship` de la nouvelle saison avec leurs dates, règles de points et format
  de jeu. Peut être fait après l'activation.

**Étape 4 — Valider et activer**
- Le wizard affiche un résumé : joueurs reconduits, joueurs partants, joueurs arrivants.
- L'utilisateur peut modifier la `endDate` de l'ancienne saison (pré-remplie depuis sa
  création, modifiable ici pour corriger si besoin — ex. création de la nouvelle saison en
  août alors que l'ancienne se terminait officiellement en juin).
- À la validation :
  1. L'ancienne saison passe en état `ARCHIVED`.
  2. Les `PlayerTeam` de l'ancienne saison sans `leaveDate` reçoivent `leaveDate = oldSeason.endDate`
     — couvre uniformément les partants (jamais fermée depuis l'étape 2) et l'ancienne
     affectation des joueurs reconduits (doublonnée avec la nouvelle jusqu'ici).
  3. La nouvelle saison passe en état `ACTIVE`.
  4. Les nouvelles `PlayerTeam` sont confirmées.

**Étape 5 — Travailler sur la nouvelle saison**

---

### Modification des saisons archivées

Les données des saisons passées sont **toujours consultables et modifiables**. Il n'y a pas de
verrou sur une saison archivée. Cas d'usage typique : corriger une information manquante sur
la saison qui vient de se terminer après avoir déjà créé la nouvelle.

**Conséquence à documenter pour les utilisateurs** : modifier une date ou un `PlayerTeam`
sur une saison archivée impacte les statistiques calculées pour cette période — c'est le
comportement attendu, pas un bug.

---

## Historique des assignations joueur ↔ équipe

### Comment ça fonctionne

Grâce au workflow de transition, chaque saison génère des entrées `PlayerTeam` avec des dates
explicites. L'historique d'un joueur est donc lisible par simple tri chronologique :

```
Joueur X — historique PlayerTeam :
  U13 A : joinDate 01/09/2022, leaveDate 30/06/2023  ← Saison 2022/2023
  U14 A : joinDate 01/09/2023, leaveDate 30/06/2024  ← Saison 2023/2024
  U15 A : joinDate 01/09/2024, leaveDate null         ← Saison actuelle
```

### Consultation du profil joueur par saison

Sur la fiche du joueur, une **liste déroulante "Saison"** permet de filtrer toutes les
statistiques et informations liées à une saison précise. Modes de filtrage disponibles :

| Mode | Requête sous-jacente |
|---|---|
| Saison courante (défaut) | `WHERE event.startAt BETWEEN season.startDate AND season.endDate` (saison active) |
| Saison passée (sélecteur) | même filtre sur la saison choisie |
| Championnat précis | `WHERE championshipMatchId IN (championshipId X)` |
| Catégorie (ex. "toutes les saisons U15") | `WHERE season.categorySnapshot = 'U15'` sur les seasons du joueur |
| Tranche de dates libre | `WHERE event.startAt BETWEEN dateA AND dateB` |
| Tout (depuis entrée au club) | pas de filtre de date |

Les `PlayerMeasurement` (taille, poids) s'affichent **toujours** en graphique d'évolution
temporelle complète, indépendamment du filtre de saison — l'évolution physique se lit dans
la durée, pas par saison.

---

## Championship

Chaque championnat définit :
- Ses propres dates (définies librement, indépendantes de la Season).
- Système de points : `pointsForWin`, `pointsForDraw`, `pointsForLoss`.
- Règles de départage : tableau JSON ordonné de `TiebreakerRule`.
- Format de jeu par défaut : `numberOfPeriods` + `periodDurationMinutes` (écrasables par match).

### Presets de règles de départage

| Preset | Règles dans l'ordre |
|---|---|
| Standard UEFA | GOAL_DIFFERENCE → GOALS_SCORED → HEAD_TO_HEAD_POINTS → HEAD_TO_HEAD_GOAL_DIFF |
| Ligue suisse junior | GOAL_DIFFERENCE → GOALS_SCORED → WINS |
| Simple | GOAL_DIFFERENCE → GOALS_SCORED |
| Personnalisé | Configuration libre depuis la liste des règles disponibles |

### Règles de départage disponibles

```
GOAL_DIFFERENCE           différence de buts générale
GOALS_SCORED              buts marqués (général)
GOALS_CONCEDED            buts encaissés (ordre croissant)
WINS                      nombre de victoires
HEAD_TO_HEAD_POINTS       points en confrontation directe
HEAD_TO_HEAD_GOAL_DIFF    différence de buts en confrontation directe
HEAD_TO_HEAD_GOALS_SCORED buts marqués en confrontation directe
AWAY_GOALS                règle du but à l'extérieur
RANDOM                    tirage au sort (dernier recours, signalé dans l'UI)
```

**FAIR_PLAY exclu du MVP** : système de points de pénalité géré par la fédération, non
calculable automatiquement. Post-MVP : saisie manuelle de points de pénalité sur la fiche
équipe du championnat.

---

## ChampionshipParticipant

Représente une équipe dans un championnat :
- Équipe interne : `internalTeamId → Team`
- Équipe externe : `externalTeamId → ExternalTeam`

Contrainte applicative : exactement l'un des deux doit être non-null.

---

## ExternalTeam

Scopée au **Club** (pas au championship ni à la season). Créée une fois, réutilisable d'un
championnat à l'autre. Sert aussi de contexte pour les rapports de scouting.

---

## ChampionshipMatch

Représente toute rencontre du championnat — notre équipe ou adversaires entre eux.

**Règle de score — source de vérité unique** :

| Type de match | Où est stocké le score |
|---|---|
| Match amical (pas de championnat) | `Match.scoreHome` / `Match.scoreAway` |
| Match de championnat | `ChampionshipMatch.scoreHome/Away`. `Match.scoreHome/Away` = NULL |

**Format de jeu** : `numberOfPeriods` et `periodDurationMinutes` héritent du Championship,
écrasables par match individuel.

---

## Classement — calculé à la volée

Calculé à chaque requête depuis les `ChampionshipMatch` terminés. Pas de table `Standing` en
MVP (20 équipes × ~20 matchs = quelques centaines de lignes, parfaitement supportable).

**Algorithme** :
1. Agréger points, buts, victoires/nuls/défaites par `ChampionshipParticipant`.
2. Trier par points décroissants.
3. Appliquer `tiebreakerRules` dans l'ordre en cas d'égalité.
4. `HEAD_TO_HEAD_*` : sous-agréger sur les matchs entre les équipes ex-aequo uniquement.

---

## Droits par rôle

| Action | Coach (son équipe) | AdminClub | SuperAdmin / Propriétaire | Player / Parent |
|---|---|---|---|---|
| Créer / activer une Season | ✅ | ✅ | ✅ | ❌ |
| Modifier une Season archivée | ✅ | ✅ | ✅ | ❌ |
| Créer un Championship | ✅ | ✅ | ✅ | ❌ |
| Ajouter des ExternalTeam | ✅ | ✅ | ✅ | ❌ |
| Saisir les résultats adverses | ✅ | ✅ | ✅ | ❌ |
| Voir le classement | ✅ | ✅ | ✅ | ✅ (lecture) |
