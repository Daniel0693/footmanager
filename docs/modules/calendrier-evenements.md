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

## Absences (étape B8, 2026-07-08)

`PlayerAbsence` (docs/schema/joueurs.md) — absence planifiée d'un joueur, indépendante de
l'équipe. CRUD scopé joueur (`POST/GET/PATCH/DELETE clubs/:clubId/players/:playerId/absences`,
permission `player_absence`), même conventions que `player_objective` (assignation automatique
de `reportedById` au membre appelant, `assertPlayerInTeam` pour le scope Coach) mais sans modèle
de visibilité — une absence n'a rien à cacher entre Privé/Semi-privé/Public. Seule interface :
l'onglet Absence de la fiche joueur (`AbsenceTab`, liste/création/édition/suppression avec
confirmation obligatoire).

**Décision — pas d'affichage dans le calendrier (2026-07-08)** : une première itération affichait
les absences comme bandeau/entrée par-joueur dans les 3 vues (Mois/Semaine/Liste), avec un endpoint
d'agrégation dédié (`GET /clubs/:clubId/absences/mine`, même principe que `events/mine`/
`members/birthdays`). Retirée après retour utilisateur : un bandeau par absence grandit
linéairement (une ligne par joueur absent, par semaine) — invivable en période de vacances avec
7-10 absents simultanés dans une équipe. L'endpoint d'agrégation a été retiré avec l'affichage
(pas de consommateur restant) plutôt que gardé inutilisé. Si un affichage calendrier est repris un
jour, privilégier un indicateur agrégé par jour (ex. "N absents", hauteur fixe) plutôt qu'un
bandeau par personne — voir aussi le futur compteur de participants aux événements
(entraînement/match), qui répond à un besoin proche mais est un calcul par événement, pas une
agrégation par club/équipe.

## Lien avec les autres modules

- Un événement de type "entraînement" est étendu en relation 1–1 par l'entité
  `TrainingSession` (voir `docs/modules/entrainement.md` et `docs/schema/evenements.md`
  §TrainingSession).
- Le statut "blessé" d'un joueur (module Blessures) peut, à terme, influer sur sa disponibilité
  affichée pour les événements du calendrier — intégration légère, pas un couplage fort
  (voir `docs/modules/blessures.md`).
- Les absences planifiées (`PlayerAbsence`) sont conceptuellement liées au calendrier mais le
  rapprochement automatique avec les événements n'est pas encore câblé — voir
  `docs/schema/joueurs.md` §PlayerAbsence.
