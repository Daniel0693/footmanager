# Schéma — Joueurs (Profils, Suivi individuel)

> Tout ce qui concerne le suivi d'un joueur au niveau individuel : profil, appartenance aux
> équipes, évaluations, notes du staff, objectifs, entretiens, absences planifiées.
> Les blessures sont dans `medical.md` (données de santé, traitement RGPD spécifique).

---

## PlayerProfile — Profil global du joueur

Relation **1–1** avec `Member`. Isole les données propres au rôle Player.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `memberId` | FK → Member, **unique** | garantit la relation 1–1 |
| `licenseNumber` | String, unique, nullable | numéro de licence fédérale |
| `nationality` | String, nullable | |
| `birthDate` | Date, nullable | |
| `preferredFoot` | enum `Foot`, nullable | `LEFT` \| `RIGHT` \| `BOTH` — non renseigné par défaut |

---

## PlayerMeasurement — Historique des mesures physiques

Une ligne par mesure — jamais de mise à jour en place. Conserve l'historique complet pour
afficher la courbe d'évolution (taille, poids) indépendamment des saisons.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `type` | enum `MeasurementType` | |
| `value` | Decimal | cm pour HEIGHT, kg pour WEIGHT |
| `date` | Date | |

---

## PlayerTeam — Appartenance joueur ↔ équipe

Table de jointure explicite (relation n–n avec données additionnelles).
Chaque entrée correspond à une période d'appartenance d'un joueur à une équipe.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `teamId` | FK → Team | |
| `jerseyNumber` | Int, nullable | unicité sur `(teamId, jerseyNumber)` recommandée |
| `mainPosition` | enum `Position`, nullable | voir `index.md` |
| `secondaryPositions` | `Position[]`, défaut `[]` | un joueur peut couvrir plusieurs postes secondaires (décision du 2026-07-06) ; tableau plutôt qu'une table de jointure séparée, jamais interrogé indépendamment de son `PlayerTeam` |
| `joinDate` | Date, nullable | début de la période dans cette équipe |
| `leaveDate` | Date, nullable | fin de la période (null = toujours actif) |

**Unicité** : `(playerId, teamId)` avec chevauchement de dates interdit au niveau applicatif
(un joueur ne peut pas être dans la même équipe deux fois en même temps).

**Historisation** : le workflow de transition de saison (voir `championnats.md`) crée de
nouvelles entrées `PlayerTeam` à chaque nouvelle saison, ce qui rend l'historique lisible :
```
Joueur X :
  U13 A : joinDate 01/09/2022, leaveDate 30/06/2023
  U14 A : joinDate 01/09/2023, leaveDate 30/06/2024
  U15 A : joinDate 01/09/2024, leaveDate null  ← saison actuelle
```

---

## TeamStaff — Affectation staff ↔ équipe

Plusieurs entraîneurs par équipe sont supportés nativement.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `teamId` | FK → Team | |
| `memberId` | FK → Member | |
| `staffRole` | enum `TeamStaffRole` | |
| `startDate` | Date, nullable | |
| `endDate` | Date, nullable | |

**Droits** : parité complète entre `PRINCIPAL`, `CO_ENTRAINEUR` et `ADJOINT` sur la gestion
de l'équipe. Exception : un Adjoint/Co-entraîneur ne peut pas modifier la fiche `TeamStaff`
de l'Entraîneur principal.

---

## EvaluationCategory — Axe du radar d'évaluation

Entité propre pour chaque axe du radar. Remplace l'ancien champ `category` (String) sur
`EvaluationCriterion` qui ne permettait ni activation/désactivation ni extension par sport.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `name` | String | ex. "Technique", "Vie de groupe" |
| `description` | String, nullable | |
| `isSystem` | Boolean | `true` = catégorie prédéfinie, non supprimable |
| `sport` | enum `SportType`, nullable | `null` = applicable à tous les sports ; non-null = scopé à un sport |
| `defaultDisplayOrder` | Int | ordre par défaut sur le radar |
| `clubId` | FK → Club, nullable | `null` = catégorie système ; non-null = catégorie custom d'un club |

**Catégories système football** (seed, `isSystem = true`, `sport = FOOTBALL`) :

| Ordre | Catégorie | Description |
|---|---|---|
| 1 | Technique | Maîtrise technique individuelle du ballon |
| 2 | Tactique | Compréhension et application des principes de jeu |
| 3 | Physique | Capacités athlétiques et physiques |
| 4 | Mental | Concentration, leadership, combativité |
| 5 | Émotionnel | Gestion du stress, self-control, confiance en soi |
| 6 | Vie de groupe | Attitude, esprit d'équipe, respect, implication collective |

Extensible sans refonte : ajouter un sport = ajouter ses `EvaluationCategory` système avec
`sport = BASKETBALL` (par exemple). Aucune migration des données existantes requise.

---

## ClubEvaluationConfig — Configuration du radar par club

Un enregistrement par couple `(club, catégorie)`. Généré automatiquement à la création
d'un club pour toutes les catégories système de son sport. Permet à chaque club de
personnaliser son radar sans toucher aux catégories système globales.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `clubId` | FK → Club | |
| `categoryId` | FK → EvaluationCategory | catégorie système ou custom du club |
| `isEnabled` | Boolean, défaut `true` | désactiver une catégorie = elle disparaît du radar |
| `displayOrder` | Int, nullable | ordre personnalisé sur le radar (écrase `defaultDisplayOrder`) |
| `customName` | String, nullable | renommage local (ex. "Comportement" au lieu de "Vie de groupe") |

**Contrainte** : unicité sur `(clubId, categoryId)`.

**Catégories custom** : quand un club crée une `EvaluationCategory` avec son `clubId`, une
entrée `ClubEvaluationConfig` correspondante est créée automatiquement (`isEnabled = true`).

**Radar dynamique** : le radar d'un joueur est construit depuis les `ClubEvaluationConfig`
du club où `isEnabled = true`, triées par `displayOrder`. Le nombre d'axes est donc variable
(pas nécessairement 6). Les bibliothèques de graphiques (recharts, chart.js) supportent
nativement un radar à N axes.

---

## EvaluationCriterion — Critère d'évaluation interne

Critères pour évaluer **les joueurs de l'équipe** (radar du profil joueur).
Distinct de `PlayerScoutingCriterion` (observation de joueurs externes — voir `scouting.md`).

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `name` | String | ex. "Contrôle de balle", "Ponctualité" |
| `categoryId` | FK → EvaluationCategory | **FK, plus une string** |
| `isSystem` | Boolean | `true` = critère prédéfini pour ce sport |
| `clubId` | FK → Club, nullable | `null` = critère système ; non-null = critère custom du club |
| `description` | String, nullable | |

**Critères système football** (seed, `isSystem = true`) :

| Catégorie | Critères |
|---|---|
| Technique | Contrôle de balle · Passe courte · Passe longue · Frappe · Dribble / 1c1 · Jeu de tête |
| Tactique | Placement sans ballon · Lecture du jeu · Prise de décision · Pressing · Utilisation de l'espace |
| Physique | Vitesse · Endurance · Puissance · Souplesse / mobilité |
| Mental | Concentration · Leadership · Combativité · Résilience · Gestion de l'erreur |
| Émotionnel | Gestion du stress · Self-control · Confiance en soi · Réaction aux critiques |
| Vie de groupe | Attitude à l'entraînement · Esprit d'équipe · Respect des règles · Ponctualité · Implication hors temps de jeu |

Un club peut désactiver des critères système (via `ClubEvaluationConfig` sur leur catégorie)
ou ajouter ses propres critères dans n'importe quelle catégorie (system ou custom).

---

## PlayerEvaluation — Évaluation sur un critère

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `criterionId` | FK → EvaluationCriterion | |
| `score` | Decimal(4,1) | **sur 10**, paliers de 0.5 |
| `date` | Date | |
| `evaluatorId` | FK → Member, nullable | staff ayant noté |
| `teamId` | FK → Team, nullable | contexte si le joueur joue dans plusieurs équipes |
| `comments` | Text, nullable | |
| `trainingSessionId` | FK → TrainingSession, nullable | évaluation liée à une séance |
| `matchId` | FK → Match, nullable | évaluation liée à un match |

---

## PlayerNote — Notes du staff sur un joueur

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `authorId` | FK → Member | |
| `visibility` | enum `NoteVisibility` | voir `index.md` |
| `title` | String, nullable | |
| `content` | Text | |
| `trainingSessionId` | FK → TrainingSession, nullable | |

**Tension RGPD** : les notes `PRIVE` ne sont pas visibles par le joueur dans l'UI normale.
Voir `docs/decisions-ouvertes-et-rgpd.md` (Article 15).

---

## PlayerInterview — Entretien individuel joueur-staff

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `staffId` | FK → Member, nullable | conducteur principal de l'entretien |
| `date` | Date | |
| `subject` | String | ex. "Bilan mi-saison U17" |
| `summary` | Text | |
| `staffFeedback` | Text | retours/conseils donnés au joueur |
| `playerFeedback` | Text, nullable | réservé pour une future saisie par le joueur |

---

## PlayerObjective — Objectif de développement

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `theme` | enum `ObjectiveTheme` | |
| `description` | Text | |
| `horizon` | enum `ObjectiveHorizon` | |
| `status` | enum `ObjectiveStatus` | |
| `visibility` | enum `NoteVisibility`, **défaut `SEMI_PRIVE`** | le joueur voit ses propres objectifs |
| `startDate` | Date, nullable | |
| `dueDate` | Date, nullable | |
| `completedDate` | Date, nullable | |
| `assignedById` | FK → Member, nullable | staff ayant créé l'objectif |

**Pas de lien à une saison fixe** → suivi multi-saisons natif. Un objectif reste `IN_PROGRESS`
d'une saison à l'autre tant qu'il n'est pas `ACHIEVED` ou `FAILED`.

---

## PlayerAbsence — Absence planifiée

Indépendante de l'équipe : s'applique à toutes les activités du joueur sur la période.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `reason` | String | texte libre |
| `startDate` | Date | |
| `endDate` | Date | |
| `isExcused` | Boolean, nullable | |
| `reportedById` | FK → Member, nullable | |

---

## Enums

```prisma
enum MeasurementType {
  HEIGHT
  WEIGHT
  // extensible : IMC, VITESSE, etc.
}

enum TeamStaffRole {
  PRINCIPAL
  CO_ENTRAINEUR
  ADJOINT
}

enum ObjectiveTheme {
  TECHNIQUE
  PHYSIQUE
  MENTAL
  TACTIQUE
}

enum ObjectiveHorizon {
  SHORT_TERM
  MID_TERM
  LONG_TERM
}

enum ObjectiveStatus {
  PLANNED
  IN_PROGRESS
  ACHIEVED
  FAILED
}
```

---

## Filtrage des statistiques par période

Toutes les stats d'un joueur (buts, présences, évaluations...) sont filtrables car chaque
entité source est horodatée. Modes de filtrage disponibles dans l'UI :

**Phasage (décision du 2026-07-06)** : `Season`/`Championship` n'existent pas avant la Phase 3.
Les onglets Mesures/Évaluation/Objectifs/Entretien/Notes construits en Phase 2 (étape A7)
n'implémentent donc que le filtrage par plage de dates libre ; le filtrage par saison/championnat
ci-dessous est à ajouter rétroactivement en Phase 3 — voir `docs/roadmap.md` §Partie A/étape A7.

| Mode | Requête |
|---|---|
| Saison courante | `WHERE event.startAt BETWEEN season.startDate AND season.endDate` |
| Saison précise | même filtre sur la saison choisie |
| Championnat précis | `WHERE championshipMatchId IN (championship X)` |
| Catégorie d'âge | `WHERE season.categorySnapshot = 'U15'` |
| Tranche de dates libre | `WHERE event.startAt BETWEEN dateA AND dateB` |
| Tout (depuis entrée au club) | pas de filtre |

`PlayerMeasurement` : toujours en graphique d'évolution temporelle complète, sans filtre de saison.

---

## Index

```
@@unique([memberId])                       sur PlayerProfile (relation 1-1)
@@unique([clubId, categoryId])             sur ClubEvaluationConfig
@@index([playerId])                        sur PlayerTeam, PlayerEvaluation, PlayerNote,
                                              PlayerInterview, PlayerObjective, PlayerAbsence
@@index([teamId])                          sur PlayerTeam
@@index([playerId, date])                  sur PlayerEvaluation, PlayerAbsence
@@index([teamId, memberId])                sur TeamStaff
@@index([categoryId])                      sur EvaluationCriterion
@@index([clubId])                          sur EvaluationCategory, ClubEvaluationConfig
```

**Pas de contrainte SQL `@@unique([teamId, jerseyNumber])`** sur `PlayerTeam` : l'historisation
par `joinDate`/`leaveDate` conserve les anciennes affectations, donc un numéro doit pouvoir être
réattribué à un autre joueur d'une saison à l'autre. L'unicité du numéro parmi les affectations
**actives** (`leaveDate` `NULL`) d'une même équipe est vérifiée au niveau applicatif (module
Effectif).
