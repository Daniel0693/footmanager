# Module — Entraînement

## Principe de conception

`TrainingSession` est une extension **1–1** de l'entité générique `Event` (un événement de
type `TRAINING` possède une `TrainingSession` associée). Toute la mécanique du calendrier
(création, filtres, code couleur) est réutilisée sans dupliquer de logique.

Entités associées (détail des champs : `docs/schema/evenements.md`) :
- `TrainingSession`
- `Exercise`
- `TrainingSessionExercise` (liaison séance ↔ exercices, avec ordre)
- `TrainingAttendance`
- `TrainingFeedback`

---

## Prérequis structurel — TeamStaff

**Décision tranchée** : la table `TeamStaff` est confirmée, avec les rôles `PRINCIPAL`,
`CO_ENTRAINEUR` et `ADJOINT`. Le module Entraînement dépend de cette table pour gérer
correctement le co-coaching. Voir `docs/schema/joueurs.md` §TeamStaff.

---

## Cycle de vie d'une séance

### 1. Création (avant la séance)

L'entraîneur crée un événement de type `TRAINING` dans le calendrier. La `TrainingSession`
associée est créée automatiquement. Il peut alors :
- Définir le thème de la séance (technique, physique, tactique...).
- Composer le programme d'exercices (`TrainingSessionExercise`) depuis la bibliothèque
  personnelle ou en créant un exercice à la volée dans l'éditeur graphique.
- Réordonner les exercices par glisser-déposer.
- Définir la fenêtre d'édition du feedback joueur (`TrainingFeedback.editableUntil`).

### 2. Pendant la séance

- L'entraîneur peut pointer les présences (`TrainingAttendance`) directement depuis la liste
  de l'effectif.
- Il peut afficher les exercices un par un (mode "lecture de séance").

### 3. Après la séance

- **Présences** : confirmer ou corriger les statuts (PRESENT / ABSENT_EXCUSE / ABSENT_NON_EXCUSE).
- **Évaluation de la séance** : `TrainingSession.globalRating` (sur 10) +
  `TrainingSession.globalComment` — note et compte-rendu global de la séance par l'entraîneur.
- **Évaluation des joueurs** : `PlayerEvaluation` liée à la `trainingSessionId` — critères du
  radar, note sur 10, commentaire.
- **Feedback joueur** : chaque joueur peut soumettre son `TrainingFeedback` (note + commentaire)
  jusqu'à la date `editableUntil` définie par l'entraîneur. Après cette date, seul l'entraîneur
  peut modifier le feedback.

---

## Droits par rôle

| Action | Coach (son équipe) | AdminClub | Player | Parent |
|---|---|---|---|---|
| Créer / modifier une séance | ✅ | ❌ | ❌ | ❌ |
| Voir le contenu complet de la séance (exercices, stats, présences) | ✅ | ✅ | ❌ | ❌ |
| Pointer les présences | ✅ | ❌ | ❌ | ❌ |
| Évaluer les joueurs | ✅ | ❌ | ❌ | ❌ |
| Soumettre un feedback (avant `editableUntil`) | ❌ | ❌ | ✅ (le sien) | ✅ (de son enfant) |
| Modifier un feedback après `editableUntil` | ✅ | ❌ | ❌ | ❌ |
| Voir son propre feedback | ❌ | ❌ | ✅ | ✅ (de son enfant) |

**AdminClub** voit le contenu complet des séances (exercices, statistiques, présences) en
lecture seule — oversight sans droit d'édition.

---

## Éditeur graphique d'exercices

Terrain virtuel calibré, placement de joueurs (pions par bouton ou glisser-déposer), tracés de
flèches simples pour le MVP. Le schéma graphique est stocké en JSON (`Exercise.schemaData`) pour
permettre la réédition. Une image PNG peut être générée à l'export.

Bibliothèque personnelle d'exercices avec titre, description, tags. Version MVP volontairement
simplifiée — animations, templates avancés et bibliothèque partagée de club sont des évolutions
futures, pas un manque à combler dès le départ.

---

## Politique de fenêtre d'édition du feedback

`TrainingFeedback.editableUntil` est défini par l'entraîneur à la création ou modification de
la séance (date/heure limite, ex. "les joueurs peuvent donner leur feedback jusqu'au
XX.XX.XXXX à 23h59").

- Avant `editableUntil` : le joueur (ou le parent de son enfant) peut soumettre et modifier son
  feedback.
- Après `editableUntil` : le feedback est verrouillé pour le joueur/parent. Seul l'entraîneur
  peut encore le modifier en cas de besoin (correction, erreur...).
- Si `editableUntil` est null : le feedback reste modifiable indéfiniment par le joueur (utile
  pour les séances sans contrainte de délai).

---

## Lien avec les autres modules

- **Calendrier** : la séance est un `Event`, affiché dans le calendrier avec le code couleur
  approprié.
- **Effectif / PlayerProfile** : `PlayerEvaluation` (avec `trainingSessionId`) enrichit le radar
  de progression du joueur.
- **Matchs** : le module Entraînement est indépendant des matchs dans le schéma, mais les
  thèmes de séance peuvent être liés aux axes de progression détectés en match (logique
  applicative, pas une contrainte de schéma).
