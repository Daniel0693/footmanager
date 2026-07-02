# Module — Gestion de l'effectif

## Profil joueur — onglets

Chaque joueur dispose d'une fiche profil organisée en onglets :

| Onglet | Contenu | Entité(s) associée(s) |
|---|---|---|
| **Dashboard** | vue d'ensemble (stats clés, dernières évaluations, objectifs en cours) | agrégation |
| **Mesures** | courbes d'évolution (taille, poids...) | `PlayerMeasurement` |
| **Évaluation** | graphique radar sur 6 catégories | `EvaluationCriterion` + `PlayerEvaluation` |
| **Objectifs** | objectifs de développement, 4 statuts | `PlayerObjective` |
| **Entretien** | comptes-rendus d'entretiens individuels | `PlayerInterview` |
| **Absence** | absences planifiées | `PlayerAbsence` |
| **Blessure** | suivi médical | `Injury` — voir `docs/modules/blessures.md` |

### Évaluation — radar dynamique par catégories configurables

Le radar de l'onglet Évaluation est **dynamique** : ses axes correspondent aux
`ClubEvaluationConfig` du club où `isEnabled = true`, triées par `displayOrder`. Le nombre
d'axes n'est pas fixé à 6 — il reflète la configuration du club.

**6 catégories système football** (activées par défaut à la création de tout club football) :
Technique · Tactique · Physique · Mental · Émotionnel · Vie de groupe

**Ce qu'un club peut faire** :
- Désactiver une catégorie qui ne correspond pas à sa philosophie.
- Renommer une catégorie (ex. "Comportement" au lieu de "Vie de groupe").
- Réordonner les axes selon ses priorités.
- Ajouter une catégorie personnalisée (ex. "Vision de jeu" comme 7ème axe).
- Ajouter des critères personnalisés dans n'importe quelle catégorie.

**Extension multi-sports** : un club de basket verra des catégories différentes (définies
dans le seed pour `sport = BASKETBALL`). La logique de l'UI et du radar est identique —
seul le contenu du seed change. Aucune modification de code requise pour ajouter un sport.

Voir `docs/schema/joueurs.md` pour le détail des entités `EvaluationCategory`,
`ClubEvaluationConfig` et `EvaluationCriterion`.

### Notation — unique dans toute l'application

Toutes les notes sont **sur 10**, stockées en `Decimal(4,1)` par paliers de 0.5, affichées en
**étoiles sur 5** dans l'UI (valeur / 2, demi-étoiles). Voir `docs/schema-bdd.md` §16.

### Objectifs — 4 statuts, visibilité par défaut Semi-privé

- Statuts : **Programmé** (`PLANNED`), **En cours** (`IN_PROGRESS`), **Réussi** (`ACHIEVED`),
  **Échec** (`FAILED`).
- Visibilité par défaut d'un nouvel objectif : **Semi-privé** (le joueur peut voir ses propres
  objectifs — defaulter à Privé était un bug identifié et corrigé).
- Conçus sans lien à une saison fixe → suivi multi-saisons natif.

---

## Modèle de visibilité (Privé / Semi-privé / Public)

Trois niveaux de visibilité, appliqués aux `PlayerNote` et `PlayerObjective` :

- **Privé** : visible uniquement par les rôles strictement supérieurs (staff avec droits
  d'écriture sur ce joueur). Le joueur lui-même ne voit pas.
- **Semi-privé** : visible par le sujet (le joueur concerné) + les rôles supérieurs.
- **Public** : visible par le joueur, les parents rattachés, et les rôles avec accès à l'équipe.

**Le détail exact des audiences par rôle pour chaque niveau doit être vérifié par rapport aux
artefacts UI/prototypes produits**, puis documenté ici une fois confirmé. Tension RGPD associée
(Article 15) : voir `docs/decisions-ouvertes-et-rgpd.md`.

---

## Joueurs sans compte

Un joueur peut ne pas avoir de compte `User` propre (cas fréquent pour les plus jeunes
catégories). Dans ce cas :
- Un `Member` est créé sans `User` associé (ou avec un compte créé par un responsable).
- Ses présences peuvent être confirmées par un `Parent` rattaché (`TrainingAttendance.confirmedByParent`).
- Les convocations sont envoyées au(x) parent(s) rattaché(s).

---

## Lien avec les autres modules

- L'onglet **Blessure** s'appuie sur le module Blessures — qui peut influer sur la disponibilité
  du joueur dans le calendrier et les convocations.
- Les `PlayerEvaluation` peuvent être liées à une séance (`trainingSessionId`) ou à un match
  (`matchId`) via les champs optionnels anticipés dans le schéma.
- Le module **Matchs** alimente les statistiques affichées dans le Dashboard du joueur.
