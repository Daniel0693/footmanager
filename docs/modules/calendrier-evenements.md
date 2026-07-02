# Module — Calendrier & Événements

## Code couleur

- **Vue coach / joueur** : code couleur **par type d'événement** (ex. entraînement, match
  domicile, match extérieur, autre).
- **Vue AdminClub** : code couleur **par équipe**, pour avoir une vision d'ensemble multi-équipe
  du club.

Le code couleur doit donc s'adapter selon le rôle de l'utilisateur connecté, pas être figé
globalement.

## Filtres

Filtres par cases à cocher dans une **barre latérale** (sidebar), permettant d'afficher/masquer
certains types d'événements ou certaines équipes selon le contexte.

## Création d'événements

- **Création directe** au clic sur une cellule de jour dans la vue calendrier.
- **Sélection par glisser (drag-to-select)** pour créer un événement s'étalant sur plusieurs
  jours en une seule action.

## Lien avec les autres modules

- Un événement de type "entraînement" est étendu en relation 1–1 par l'entité
  `TrainingSession` (voir `docs/modules/entrainement.md` et `docs/schema-bdd.md` §11).
- Le statut "blessé" d'un joueur (module Blessures) peut, à terme, influer sur sa disponibilité
  affichée pour les événements du calendrier — intégration légère, pas un couplage fort
  (voir `docs/modules/blessures.md`).
- Les absences planifiées (`PlayerAbsence`) sont conceptuellement liées au calendrier mais le
  rapprochement automatique avec les événements n'est pas encore câblé — voir
  `docs/schema-bdd.md` §9.
