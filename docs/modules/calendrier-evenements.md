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

**Vue Liste — extension automatique de fenêtre (correctif post-B9, 2026-07-09)** : bug signalé —
avec la sélection de types vide (seul le filtre "Anniversaires" actif), un anniversaire hors de
la fenêtre initiale (14 jours avant/60 jours après aujourd'hui) restait invisible et impossible à
découvrir, la liste ne débordant pas assez pour déclencher le scroll infini existant. `CalendarListView`
étend désormais automatiquement la fenêtre (alterné passé/futur, par blocs de 30 jours) tant
qu'elle contient moins de `MIN_TIMELINE_ITEMS` (8) anniversaires, plafonné à
`MAX_AUTO_EXPANSIONS` (6) itérations pour rester borné en requêtes réseau. **Portée volontairement
restreinte** à la sélection de types/équipes vide (le cas réellement signalé, où `loadOlder`/
`loadNewer` n'appellent jamais `fetchCalendarEvents`, donc aucun risque de chevauchement avec un
chargement au scroll déclenché par l'utilisateur) — non généralisée à toute fenêtre pauvre en
véritables événements, qui poserait un risque de chevauchement bien réel avec le scroll manuel
(flag `isLoadingMore` partagé). À revisiter si un besoin similaire est signalé avec de vrais
événements.

**Vue Liste — doublons d'anniversaire après plusieurs clics rapprochés sur "Aujourd'hui"
(correctif post-B9, 2026-07-09)** : `loadOlder`/`loadNewer` sont invoquées de façon impérative
(scroll, extension automatique ci-dessus) et n'avaient aucun garde-fou de génération — un appel
encore en vol au moment d'un clic "Aujourd'hui" pouvait appliquer son résultat (bornes de fenêtre)
une fois le cycle suivant déjà démarré, rouvrant une fenêtre censée avoir été réinitialisée
(symptôme observé : la même personne apparaît deux fois, avec deux âges différents — deux
occurrences annuelles distinctes de son anniversaire tombant toutes deux dans la fenêtre
rouverte). Corrigé par un compteur de génération (`generationRef`) : chaque appel
loadOlder/loadNewer fige la génération au moment de son invocation et ignore son résultat si un
nouveau cycle (recentrage, changement de filtres) a démarré entre-temps. Testé par simulation de
rerenders rapprochés (`recenterKey` incrémenté sans attendre la convergence du cycle précédent).

**Vue Liste — date manquante sur les anniversaires** : `birthdayAge` (icône + prénom/nom + âge)
ne permettait pas de distinguer deux occurrences d'une même personne dans une fenêtre élargie, ni
de savoir à quelle date exacte l'anniversaire tombe. Clé de traduction dédiée à la vue Liste,
`birthdayAgeWithDate` (icône + prénom/nom + date `formatDate()` JJ/MM/AAAA + âge) — Mois/Semaine
gardent `birthdayAge` sans date, la position dans la grille suffisant à la désambiguïser.

## Absences (étape B8, 2026-07-08)

`PlayerAbsence` (docs/schema/joueurs.md) — absence planifiée d'un joueur, indépendante de
l'équipe. CRUD scopé joueur (`POST/GET/PATCH/DELETE clubs/:clubId/players/:playerId/absences`,
permission `player_absence`), même conventions que `player_objective` (assignation automatique
de `reportedById` au membre appelant, `assertPlayerInTeam` pour le scope Coach) mais sans modèle
de visibilité — une absence n'a rien à cacher entre Privé/Semi-privé/Public. Seule interface :
l'onglet Absence de la fiche joueur (`AbsenceTab`, liste/création/édition/suppression avec
confirmation obligatoire). `reason` est une liste fermée (`AbsenceReason` — Blessure/Maladie/
Vacances/Autre, voir `docs/schema/joueurs.md` §PlayerAbsence) complétée par un champ
`description` libre optionnel, plutôt qu'un texte libre unique — permet des statistiques par
motif (correctif post-B9, 2026-07-09).

**Un joueur peut déclarer sa propre absence à l'avance (correctif post-B9, 2026-07-09)** :
permission `player_absence CREATE OWN` accordée au rôle `Player`, en plus du `READ OWN` déjà
existant — anticiper une indisponibilité connue (vacances, rendez-vous médical...) plutôt que de
n'être signalée que par l'entraîneur. `isExcused` (justifiée/non justifiée) reste **exclusivement**
la décision de l'entraîneur ou d'un admin : masqué du formulaire de création côté frontend quand
le joueur déclare sa propre absence (`AbsenceFormDialog canSetExcused={false}`), et forcé à `null`
côté backend (`PlayerAbsencesService.create`) même si transmis explicitement dans la requête — un
joueur ne peut jamais s'auto-justifier. Un joueur n'a ni `UPDATE` ni `DELETE` sur ses absences
(scope `OWN` limité à `READ`/`CREATE`) : les actions d'édition/suppression sont masquées dans
`AbsenceTab` (`isOwnProfile`) plutôt que de mener à un 403 au clic. Notification à l'entraîneur
lors d'une déclaration par un joueur : différée au système de notifications, décision ouverte #2.

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

## Récurrence (2026-07-08)

Pas d'entité `RecurringRule` (décision d'architecture, voir `docs/schema/evenements.md` §Event) :
à la création, le frontend calcule la liste concrète des dates d'occurrence
(`lib/recurrence.ts`, `computeOccurrenceDates(rule, rangeStart, rangeEnd)`, pur et testé
indépendamment de l'UI) puis envoie un événement par date à `POST .../events/bulk` en une seule
requête (`EventsService.createBulk`, `prisma.event.createMany`).

- Trois types de règle : hebdomadaire (jours de semaine cochés), mensuel (jour fixe du mois OU
  Nième/dernier jour de semaine du mois), annuel (date fixe OU Nième/dernier jour de semaine d'un
  mois donné).
- Garde-fou `MAX_OCCURRENCES = 200` (frontend et backend, `@ArrayMaxSize(200)`).
- `EventFormDialog` : case "Événement récurrent", en création uniquement (éditer une occurrence
  n'a pas de sens en tant que série) — remplace Début/Fin par une heure de début/fin commune +
  type de récurrence + champs spécifiques + plage de dates de la récurrence. Aperçu du nombre
  d'occurrences recalculé en direct.

## Édition et suppression en masse (2026-07-08)

`Event.recurringGroupId` (voir `docs/schema/evenements.md`) permet de retrouver "cet événement et
les suivants" sans entité `RecurringRule` dédiée.

- `PATCH`/`DELETE .../events/:id?scope=single|future` — `single` par défaut (comportement
  historique inchangé). En `future`, seuls titre/type/lieu/description/heure se propagent aux
  occurrences du même groupe à partir de l'ancre (`startAt >= ancre`), la date de chacune étant
  préservée. Retombe silencieusement sur `single` si l'événement n'appartient à aucun groupe
  récurrent. Ne change pas le modèle RBAC (même permission qu'une édition/suppression simple).
- **Confirmation systématique avant suppression** : `DeleteEventDialog`, seul point d'entrée de
  suppression, affiche une confirmation simple pour un événement isolé, ou le choix single/future
  pour un événement récurrent (`components/ui/alert-dialog.tsx`, primitives
  `@base-ui/react/alert-dialog` sans boutons Action/Cancel imposés — chaque appelant compose son
  propre jeu de boutons).
- Éditer un événement récurrent affiche le même choix (single/future) avant d'envoyer le `PATCH`.

## Rendu des vues Mois/Semaine/Liste (mécanique)

- **Hauteur pleine page, sans scroll de page** : chaîne flexbox jusqu'aux vues ; seules les zones
  internes défilent (liste, grille mensuelle, grille horaire hebdomadaire) — même pattern que les
  onglets Mesures/Évaluation de l'Effectif.
- **Chaque vue borne sa requête à sa plage affichée** (`lib/calendar-events-api.ts`,
  `fetchCalendarEvents`) — Mois/Semaine rechargent au changement de mois/semaine ou de filtres ;
  toute mutation (création/édition/suppression) déclenche un rechargement.
- **Vue Liste** (`CalendarListView`) : scroll infini, fenêtre initiale J-14/J+60 autour
  d'aujourd'hui, extension par blocs de 30 jours au scroll (vers le haut = passé, vers le bas =
  futur), compensation du saut visuel au prepend. Le bouton "Aujourd'hui" réinitialise la fenêtre
  (`recenterKey`) au lieu de simplement rafraîchir son contenu.
- **Vue Semaine** : grille horaire (06h-23h, scroll interne), répartition côte-à-côte des
  événements qui se chevauchent (algorithme de voies glouton, pas un compactage optimal), bandeau
  dédié au-dessus de la grille pour les événements multi-jours. Pas de glisser multi-jours dans
  cette vue (clic simple) — réservé à la vue Mensuelle.
- **Vue Mois** : grille de 6 semaines (`CalendarGridDays`, partagée avec la vue Semaine), bandeau
  multi-jours superposé en `position: absolute` à l'intérieur de chaque bloc semaine (même
  algorithme de voies que la vue Semaine, appliqué ici à des colonnes de jours), numéro de semaine
  ISO 8601 affiché en gouttière à gauche. Heure de l'événement affichée à côté du titre dans la
  cellule.
- Création par clic (mousedown+mouseup même jour) ou par glisser (mousedown+mouseenter+mouseup,
  écouté sur `window` pour capter un relâchement hors grille) en vues Mois/Semaine.

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
