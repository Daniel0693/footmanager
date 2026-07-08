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

## Anniversaires (2026-07-08)

Les anniversaires des membres (`Member.birthDate`, commun à tous les rôles — voir
`docs/schema/fondations.md`) apparaissent comme éléments **non éditables, non cliquables** dans
les trois vues (Liste/Mois/Semaine), avec une icône, le prénom/nom du membre et son âge calculé.
Filtre dédié ("Anniversaires") dans la barre latérale, actif par défaut, indépendant des filtres
`typeFilter`/`teamFilter` — un anniversaire n'est **jamais** un `EventType` ni fusionné dans
`ExistingEvent` (voir `event-form-dialog.tsx`), pour ne jamais devenir accidentellement éditable
via le formulaire d'événement.

Backend : `GET /clubs/:clubId/members/birthdays` (`MembersService.findBirthdaysInClub`), même
principe de scope que le reste du calendrier (voir `events/mine`) — club entier pour
AdminClub/SuperAdmin, sinon union de deux chemins d'appartenance équipe : staff via `MemberRole`
et joueurs via `PlayerTeam` actif (`leaveDate: null`). Ne renvoie jamais `birthDate` brut, jamais
les occurrences passées par rapport à la fenêtre demandée.

## Lien avec les autres modules

- Un événement de type "entraînement" est étendu en relation 1–1 par l'entité
  `TrainingSession` (voir `docs/modules/entrainement.md` et `docs/schema-bdd.md` §11).
- Le statut "blessé" d'un joueur (module Blessures) peut, à terme, influer sur sa disponibilité
  affichée pour les événements du calendrier — intégration légère, pas un couplage fort
  (voir `docs/modules/blessures.md`).
- Les absences planifiées (`PlayerAbsence`) sont conceptuellement liées au calendrier mais le
  rapprochement automatique avec les événements n'est pas encore câblé — voir
  `docs/schema-bdd.md` §9.
