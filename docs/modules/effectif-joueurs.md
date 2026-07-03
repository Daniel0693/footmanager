# Module — Gestion de l'effectif

> **État d'implémentation (Phase 2)** : liste de l'effectif par équipe (table + filtres par
> ligne/poste) et navigation club → équipe → effectif sont construites. La fiche joueur
> individuelle reste à faire — seule sa structure est planifiée. La plupart des onglets dépendent
> d'entités qui n'existent pas encore (`PlayerMeasurement`, `PlayerEvaluation`, `PlayerObjective`,
> `PlayerInterview`, `PlayerAbsence` arrivent en Phase 6 ; `Injury` en Phase 8) : seul le panneau
> d'informations (identité + affectation équipe, entités déjà en place) sera fonctionnel à
> l'ouverture de la fiche, les 7 onglets seront visibles mais désactivés/"à venir" jusqu'à leur
> phase respective.

## Liste de l'effectif — filtres par poste

Table par équipe : numéro de maillot, nom, poste principal (badge), poste secondaire. Deux
filtres combinables :
- **Par ligne** (Gardien/Défense/Milieu/Attaque) — la ligne n'est pas stockée en base, elle est
  dérivée du poste précis en code (voir `docs/schema/index.md` §enum `Position`). Sélectionner
  une ligne réduit les postes proposés dans le second filtre à ceux de cette ligne.
- **Par poste précis** (15 postes réels, voir `docs/schema/index.md`) — filtre sur
  `mainPosition` uniquement ; le poste secondaire est affiché mais non filtrable.

## Profil joueur — mise en page 2 colonnes

La fiche joueur est structurée en deux colonnes :
- **Colonne de gauche (fixe, toujours visible)** : panneau d'informations statiques —
  identité (nom, avatar/initiales, rôle, email si compte, téléphone, date de naissance, genre) +
  informations sportives (statut actif/inactif, date d'arrivée dans l'équipe, numéro de licence,
  pied fort, numéro de maillot, poste principal/secondaire). Alimenté par `Member` +
  `PlayerProfile` + l'affectation `PlayerTeam` active — toutes ces entités existent déjà, donc ce
  panneau est fonctionnel dès sa construction.
- **Colonne de droite (zone principale)** : barre à 7 onglets, aucun fonctionnel avant sa phase
  respective (voir tableau ci-dessous).

## Profil joueur — onglets

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
