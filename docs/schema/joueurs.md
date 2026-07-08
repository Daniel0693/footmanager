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
| `preferredFoot` | enum `Foot`, nullable | `LEFT` \| `RIGHT` \| `BOTH` — non renseigné par défaut |

**`birthDate`** : déplacé sur `Member` le 2026-07-08 (voir `docs/schema/fondations.md`) — commun à
tous les rôles, pas seulement au Player.

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

## PlayerEvaluation — Session d'évaluation (tous les critères notés en une fois)

Une évaluation est **une session** : le coach note tous les critères actifs du club en un seul
formulaire (pas une entrée par critère). Le radar du profil joueur affiche la session la plus
récente (moyenne par catégorie) ; les sessions précédentes restent en base pour l'historique,
affiché en tableau (une ligne par date, une colonne par catégorie — voir
`docs/modules/effectif-joueurs.md` §Évaluation). Décision confirmée le 2026-07-06 : **tous les
critères actifs sont obligatoires** à la validation d'une session (pas de saisie partielle), pour
garantir une moyenne de catégorie toujours complète et comparable d'une session à l'autre.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `date` | Date | date de la session |
| `evaluatorId` | FK → Member, nullable | assigné automatiquement au membre à l'origine de la création, jamais choisi dans un sélecteur (même pattern que `PlayerInterview.staffId`) ; nullable pour permettre un futur import de données historiques sans auteur identifié |
| `teamId` | FK → Team, nullable | contexte si le joueur joue dans plusieurs équipes — jamais utilisé pour la vérification de permission (`assertPlayerInTeam` se base sur l'appartenance réelle du joueur à l'équipe transmise en query, pas sur ce champ) ; non exposé par l'API pour l'instant |
| `comments` | Text, nullable | **global à la session**, pas par critère |

**`trainingSessionId`/`matchId` (liens optionnels vers une séance/un match) différés aux Phases
5/4** : `TrainingSession`/`Match` n'existent pas encore — champs ajoutés par migration une fois
ces modèles disponibles, pas anticipés ici (même logique que `PlayerNote.trainingSessionId`).

Pas de champ `visibility` sur ce modèle (contrairement à `PlayerNote`/`PlayerObjective`) : une
évaluation est toujours visible par le joueur concerné (scope OWN, lecture seule) en plus du
staff scopé TEAM/CLUB.

Contrairement à `PlayerMeasurement`, pas de contrainte append-only : UPDATE est autorisé pour
corriger une session (remplace intégralement ses `PlayerEvaluationScore`, voir ci-dessous) ;
DELETE supprime la session et tous ses scores en cascade.

## PlayerEvaluationScore — Score d'un critère au sein d'une session

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `evaluationId` | FK → PlayerEvaluation, `onDelete: Cascade` | |
| `criterionId` | FK → EvaluationCriterion | doit être système ou appartenir au club du joueur (vérifié à la création/modification, tous les critères soumis en une fois) |
| `score` | Decimal(4,1) | **sur 10**, paliers de 0.5 (en pratique des valeurs entières via le widget étoiles à 5 étoiles/demi-étoile, voir `docs/modules/effectif-joueurs.md`) |

`@@unique([evaluationId, criterionId])` : un critère ne peut être noté qu'une fois par session.
Une modification (UPDATE de `PlayerEvaluation`) qui fournit des scores remplace l'ensemble des
`PlayerEvaluationScore` existants de la session (suppression puis recréation), pas de fusion
partielle.

---

## PlayerNote — Notes du staff sur un joueur

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `authorId` | FK → Member | assigné automatiquement au membre à l'origine de la création, jamais choisi dans un sélecteur (même pattern que `PlayerInterview.staffId`) |
| `visibility` | enum `NoteVisibility` | voir `index.md` |
| `title` | String, nullable | |
| `content` | Text | |

**`trainingSessionId` (lien optionnel vers une séance) différé à la Phase 5** : `TrainingSession`
n'existe pas encore (module Entraînement non implémenté) — champ ajouté par migration une fois
ce modèle disponible, pas anticipé ici.

**Tension RGPD** : les notes `PRIVE` ne sont jamais transmises à un appelant en scope `OWN`
(Player) — voir `docs/decisions-ouvertes-et-rgpd.md` (Article 15). Le rôle Parent n'est pas
encore câblé sur ce modèle de visibilité (pas de table de liaison Parent↔Joueur, voir la
décision ouverte correspondante) : seule la distinction PRIVE vs SEMI_PRIVE/PUBLIC est
actuellement appliquée par `PlayerNotesService.findAllByPlayer`.

---

## PlayerInterview — Entretien individuel joueur-staff

Seuls `date`/`subject`/`summary` sont requis à la création : un entretien peut être **planifié à
l'avance** (ce qu'on prévoit d'aborder) puis complété après coup via UPDATE une fois qu'il a eu
lieu (décision du 2026-07-06).

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `staffId` | FK → Member, nullable | conducteur principal de l'entretien |
| `date` | Date | |
| `subject` | String | ex. "Bilan mi-saison U17" |
| `summary` | Text | ce qui est prévu d'être abordé |
| `staffFeedback` | Text, nullable | conclusions retenues avec le joueur — **visible par le joueur** |
| `staffAssessment` | Text, nullable | ressenti/évaluation interne de l'encadrant — **jamais visible par le joueur** |
| `playerFeedback` | Text, nullable | ce que le joueur a exprimé, résumé par le staff — **visible par le joueur** |

**Visibilité par champ pour le rôle Player (scope OWN)** : en plus de ne jamais voir
`staffAssessment`, un Player ne voit que les entretiens dont `date` est passée ou égale à
aujourd'hui — jamais ceux à venir. Voir `PlayerInterviewsService.findAllByPlayer` et
`docs/modules/effectif-joueurs.md` §Entretien.

---

## PlayerObjective — Objectif de développement

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `theme` | enum `ObjectiveTheme` | `TECHNIQUE` / `PHYSIQUE` / `MENTAL` / `TACTIQUE` |
| `description` | Text | |
| `horizon` | enum `ObjectiveHorizon` | `SHORT_TERM` / `MID_TERM` / `LONG_TERM` |
| `status` | enum `ObjectiveStatus`, **défaut `PLANNED`** | `PLANNED` / `IN_PROGRESS` / `ACHIEVED` / `FAILED` |
| `visibility` | enum `NoteVisibility`, **défaut `SEMI_PRIVE`** | le joueur voit ses propres objectifs — voir `PlayerNote` pour le modèle de visibilité complet |
| `startDate` | Date, nullable | |
| `dueDate` | Date, nullable | |
| `completedDate` | Date, nullable | |
| `assignedById` | FK → Member, nullable | staff ayant créé l'objectif — assigné automatiquement, jamais choisi dans un sélecteur (même pattern que `PlayerInterview.staffId`/`PlayerNote.authorId`) |

**Pas de lien à une saison fixe** → suivi multi-saisons natif. Un objectif reste `IN_PROGRESS`
d'une saison à l'autre tant qu'il n'est pas `ACHIEVED` ou `FAILED`. Aucune règle de transition
entre statuts n'est imposée par le backend (freeform).

**Tension RGPD** : comme `PlayerNote`, un objectif `PRIVE` n'est jamais transmis à un appelant en
scope `OWN` (Player) — voir `docs/decisions-ouvertes-et-rgpd.md` (Article 15).

---

## PlayerAbsence — Absence planifiée

**Pas encore implémenté** (n'existe pas dans `schema.prisma`) : retiré de la Partie A
(Phase 2) — sera construit avec le module Calendrier/présences (Partie B et/ou Phases 4-5),
emplacement précis à trancher au moment venu. Voir `docs/roadmap.md` §Partie A/étape A7. Champs
ci-dessous à titre de design prévisionnel, à confirmer avant implémentation.

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
@@unique([evaluationId, criterionId])      sur PlayerEvaluationScore
@@index([playerId])                        sur PlayerTeam, PlayerNote, PlayerInterview,
                                              PlayerObjective, PlayerAbsence, PlayerMeasurement
@@index([teamId])                          sur PlayerTeam
@@index([playerId, date])                  sur PlayerEvaluation, PlayerAbsence
@@index([evaluationId])                    sur PlayerEvaluationScore
@@index([teamId, memberId])                sur TeamStaff
@@index([categoryId])                      sur EvaluationCriterion
@@index([clubId])                          sur EvaluationCategory, ClubEvaluationConfig
```

**Pas de contrainte SQL `@@unique([teamId, jerseyNumber])`** sur `PlayerTeam` : l'historisation
par `joinDate`/`leaveDate` conserve les anciennes affectations, donc un numéro doit pouvoir être
réattribué à un autre joueur d'une saison à l'autre. L'unicité du numéro parmi les affectations
**actives** (`leaveDate` `NULL`) d'une même équipe est vérifiée au niveau applicatif (module
Effectif).
