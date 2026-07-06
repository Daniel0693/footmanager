# Module — Gestion de l'effectif

> **État d'implémentation (Phase 2)** : liste de l'effectif par équipe, navigation
> club → équipe → effectif, et fiche joueur (panneau d'informations + sélecteur de poste)
> sont construits. **Décision du 2026-07-06** : contrairement au découpage initial (tous les
> onglets renvoyés en Phase 6/8), Mesures/Évaluation/Objectifs/Entretien/Notes sont avancés
> dans la Partie A actuelle (étape A7, une entité à la fois — voir `docs/roadmap.md`).
> Seuls **Dashboard** (Phase 6 — dépend des stats Matchs/Entraînement) et **Blessure**
> (Phase 8 — RGPD données de santé) restent différés. **Absence** est retiré de la Partie A :
> il sera traité avec le module Calendrier/présences (Partie B et/ou Phases 4-5), pas en
> Phase 6, l'emplacement précis restant à trancher au moment venu.

## Liste de l'effectif — filtres par poste

Table par équipe : numéro de maillot, nom, poste principal (badge), poste(s) secondaire(s). Deux
filtres combinables :
- **Par ligne** (Gardien/Défense/Milieu/Attaque) — la ligne n'est pas stockée en base, elle est
  dérivée du poste précis en code (voir `docs/schema/index.md` §enum `Position`). Sélectionner
  une ligne réduit les postes proposés dans le second filtre à ceux de cette ligne.
- **Par poste précis** (15 postes réels, voir `docs/schema/index.md`) — filtre sur
  `mainPosition` uniquement ; les postes secondaires sont affichés mais non filtrables.

## Profil joueur — mise en page 2 colonnes

La fiche joueur est structurée en deux colonnes :
- **Colonne de gauche (fixe, toujours visible)** : panneau d'informations statiques —
  identité (nom, avatar/initiales, rôle, email si compte, téléphone, date de naissance, genre) +
  informations sportives (statut actif/inactif, date d'arrivée dans l'équipe, numéro de licence,
  pied fort, numéro de maillot) + un **sélecteur de poste visuel** (terrain interactif, voir
  ci-dessous). Alimenté par `Member` + `PlayerProfile` + l'affectation `PlayerTeam` active —
  toutes ces entités existent déjà, donc ce panneau est fonctionnel dès sa construction.
- **Colonne de droite (zone principale)** : barre à 8 onglets (`Notes` ajouté au découpage
  initial de 7 — décision du 2026-07-06), chacun fonctionnel dès la phase indiquée dans le
  tableau ci-dessous.

### Sélecteur de poste — terrain interactif

Le poste (principal et secondaires) se choisit par clic sur une représentation visuelle du
terrain (inspirée de Football Manager), pas via un menu déroulant, dans la carte "Positions" de
la fiche joueur :
- Deux onglets **Principal** / **Autres** au-dessus du terrain déterminent ce que fait un clic :
  en mode Principal, cliquer sur un poste le définit comme poste principal (sélection unique —
  cliquer à nouveau sur le poste déjà principal le désélectionne) ; en mode Autres, cliquer
  bascule ce poste dans/hors des postes secondaires (sélection multiple). Un poste déjà principal
  est désactivé dans l'onglet Autres pour éviter une confusion (pas de doublon principal/secondaire).
- Code couleur : poste principal en bleu, postes secondaires en orange, postes non sélectionnés en
  gris — cohérent avec les badges affichés sous le terrain.
- **Sauvegarde immédiate** : chaque clic déclenche un `PATCH` sur l'affectation `PlayerTeam`
  concernée (pas de bouton "Enregistrer" séparé) ; en cas d'échec réseau, la sélection est
  restaurée à son état précédent et une erreur est affichée.
- Le formulaire d'ajout/édition (`PlayerFormDialog`, effectif équipe) garde pour l'instant de
  simples menus déroulants pour le poste principal — un seul poste secondaire y est éditable
  (le premier élément du tableau) ; le terrain interactif n'y est pas encore utilisé (décision du
  2026-07-06, à revoir si besoin).

## Profil joueur — onglets

| Onglet | Contenu | Entité(s) associée(s) | Phase |
|---|---|---|---|
| **Mesures** | courbes d'évolution (taille, poids...) | `PlayerMeasurement` | Phase 2, étape A7.1 |
| **Entretien** | comptes-rendus d'entretiens individuels | `PlayerInterview` | Phase 2, étape A7.2 |
| **Notes** | notes du staff sur le joueur, visibilité Privé/Semi-privé/Public | `PlayerNote` | Phase 2, étape A7.3 |
| **Objectifs** | objectifs de développement, 4 statuts | `PlayerObjective` | Phase 2, étape A7.4 |
| **Évaluation** | graphique radar sur 6 catégories | `EvaluationCriterion` + `PlayerEvaluation` | Phase 2, étape A7.5 |
| **Dashboard** | vue d'ensemble (stats clés, dernières évaluations, objectifs en cours) | agrégation | Phase 6 — dépend des stats Matchs (Phase 4) et Entraînement (Phase 5) |
| **Absence** | absences planifiées | `PlayerAbsence` | Retiré de la Partie A ; à construire avec le Calendrier/présences (Partie B et/ou Phases 4-5) — emplacement précis à trancher |
| **Blessure** | suivi médical | `Injury` — voir `docs/modules/blessures.md` | Phase 8 (données de santé, RGPD dédié) |

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
