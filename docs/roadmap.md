# Roadmap — FootManager

> À mettre à jour au fur et à mesure de l'avancement réel.

Légende : ⬜ pas commencé · 🚧 en cours · ✅ terminé

---

## Phase 1 — Fondations du projet ✅

- Repository, Docker (backend NestJS, db PostgreSQL, frontend Next.js).
- Système i18n (next-intl, fichiers locales/fr.json + locales/en.json, structure de clés).
- **Entités de base** : `User`, `RefreshToken`, `Club`, `Team`, `Member`, `MemberRole`,
  `Role`, `Permission`, `RolePermission`.
- Auth : inscription, connexion, refresh token, silent refresh.
- Seed : rôles système (Player, Parent, Coach, AdminClub, SuperAdmin, Proprietaire) +
  permissions système préremplies.
- Seed : `EvaluationCategory` système football (6 catégories) + critères système (~30 critères).
- Seed : `PlayingStyleTag` système scouting (~12 tags).
- Seed : `PlayerScoutingCriterion` système (~20 critères sur 4 dimensions).
- À la création d'un club : génération automatique des `ClubEvaluationConfig` selon `Club.sport`.
- Résultat attendu : un utilisateur peut s'inscrire, se connecter, voir une page d'accueil.

  > Complété le 02/07/2026. Structure retenue : monorepo avec backend/ et frontend/ séparés, Docker Compose pour le dev local, PostgreSQL + Prisma ORM, Next.js + TailwindCSS + TypeScript pour le frontend.
  > UI : shadcn/ui + Tailwind. Seed initial effectué

---

## Phase 2 — Effectif & Calendrier 🚧

_~4–5 semaines — révisé à la hausse suite à la décision du 2026-07-06 (A7 avance 4 entités
depuis la Phase 6 dans la Partie A)_

- `PlayerProfile`, `PlayerTeam`, `TeamStaff`.
- Module Effectif : ajout/édition/suppression joueurs, liste de l'effectif, profil de base.
- Module Calendrier : création d'événements (`Event`), code couleur par type / par équipe.

> `ExternalTeam` reporté à la Phase 3 (championnats) — voir `docs/schema/championnats.md`.
> Présences et convocations reportées : elles sont modélisées par `MatchAttendance` (Phase 4)
> et `TrainingAttendance` (Phase 5), pas par un `Event` générique — voir
> `docs/schema/evenements.md`. Notifications email : voir "Évolutions post-MVP".
> Rôle `Parent` non câblé sur ce module — voir décision ouverte #5 dans
> `docs/decisions-ouvertes-et-rgpd.md` (liaison Parent ↔ Joueur non modélisée).

### Partie A — Module Effectif

| Étape | Statut | Contenu |
|---|---|---|
| Prérequis transverse | ✅ | `PermissionsGuard` + `@RequirePermission` (voir `docs/modules/auth-roles.md`) |
| Schéma (`PlayerProfile`, `PlayerTeam`, `TeamStaff`) | ✅ | Migration + enum `Position` étendu à 15 postes réels (voir `docs/schema/index.md`) |
| Backend `players` (profil joueur) | ✅ | CRUD + route self-service `/me` |
| Backend `player-teams` (effectif d'équipe) | ✅ | Affectation équipe, historisation par `leaveDate`, numéro de maillot |
| Backend `team-staff` | ✅ | CRUD + protection de la fiche du Principal |
| Backend `teams` (liste/création d'équipes) | ✅ | Non prévu initialement, nécessaire pour la navigation frontend ; route self-service `/mine` |
| Backend `clubs` — "mes clubs" | ✅ | `GET /clubs` scopé à l'utilisateur connecté, remplace un bricolage `localStorage` initial |
| Backend `members` (création/édition sans compte) | ✅ | `POST`/`PATCH /clubs/:clubId/members`, `Member.userId` nullable, champs `gender`/`preferredFoot` |
| Frontend liste effectif | ✅ | Table + filtres par ligne/poste, navigation club → équipe → effectif |
| Frontend fiche joueur (2 colonnes) | ✅ | Panneau infos statiques (identité + affectation, fonctionnel) + sélecteur de poste visuel (terrain interactif, postes secondaires multiples) + formulaire ajout/édition |
| **A7 — Profil joueur enrichi** | ✅ | **Décision du 2026-07-06** : contenu réel des onglets, un par un (voir sous-étapes ci-dessous), plutôt que de tout renvoyer en Phase 6. Les 5 sous-étapes (A7.1-A7.5) sont terminées |
| A8 — Tests multi-rôles bout-en-bout | ✅ | Scénario complet + revue de cohérence doc ↔ code (anciennement dernière étape de la Partie A, renumérotée après l'ajout de A7). Détail ci-dessous |

#### Sous-étapes A7 — une entité à la fois

| Sous-étape | Statut | Entité | Contenu |
|---|---|---|---|
| A7.1 — Mesures | ✅ | `PlayerMeasurement` | Backend (schéma/migration, CRUD READ/CREATE/DELETE — pas d'UPDATE, historique append-only —, filtres/tri via query params `type`/`dateFrom`/`dateTo`/`sortBy`/`sortOrder`, permissions, 17 tests) + onglet frontend (graphique unique 2 courbes avec légende cliquable, filtres du graphique et du tableau **partagés** — un seul jeu d'état pilote les deux —, tri de colonnes propre au tableau, ligne d'ajout compacte, suppression en rouge — tout le filtrage/tri résolu côté backend, décision du 2026-07-06, 12 tests) |
| A7.2 — Entretien | ✅ | `PlayerInterview` | Backend (schéma/migration, CRUD READ/CREATE/UPDATE/DELETE, `staffId` auto-assigné au membre appelant, filtres/tri via query params `dateFrom`/`dateTo`/`sortOrder`, permissions, 27 tests + smoke test Docker multi-rôles) + onglet frontend en **timeline** (carte par entretien, badge "Planifié" pour les entretiens à venir, dialogue unique réutilisé pour créer/éditer, suppression directe, 19 tests). Peut être **planifié à l'avance** (date/sujet/résumé seuls requis) puis complété après coup (décision du 2026-07-06) : `staffFeedback`/`staffAssessment`/`playerFeedback` sont tous optionnels. Visibilité par champ pour le Player : ne voit jamais `staffAssessment` (ressenti interne, même tension RGPD Article 15 que les notes `PRIVE`) ni les entretiens futurs — voir `docs/modules/effectif-joueurs.md` §Entretien |
| A7.3 — Notes | ✅ | `PlayerNote` | Backend (schéma/migration, CRUD READ/CREATE/UPDATE/DELETE, `authorId` auto-assigné, filtre par plage de dates + tri via `sortOrder`, tous deux sur `createdAt` avec `dateTo` étendu à la fin de journée, permissions, 26 tests + smoke test Docker multi-rôles) + onglet frontend en timeline (filtre de dates, badge de visibilité, dialogue unique créer/éditer, suppression directe, 15 tests). Introduit le modèle de visibilité Privé/Semi-privé/Public : un Player ne reçoit jamais les notes `PRIVE` (même tension RGPD Article 15 que `PlayerInterview.staffAssessment`) ; le rôle Parent n'est pas câblé sur cette visibilité (pas de liaison Parent↔Joueur). Première ressource à appliquer `assertPlayerInTeam` dès sa conception (voir correctif de sécurité ci-dessous) |
| A7.4 — Objectifs | ✅ | `PlayerObjective` | Backend (schéma/migration, CRUD READ/CREATE/UPDATE/DELETE, `assignedById` auto-assigné, filtres statut + thème + plage de dates combinables, tri sur `startDate` avec `nulls: 'last'` — pas `createdAt` —, permissions, 26 tests + smoke test Docker multi-rôles) + onglet frontend en timeline (filtres statut/thème/dates, badges statut/thème/visibilité, dates optionnelles affichées si renseignées, dialogue unique créer/éditer, suppression directe, 17 tests). Réutilise le modèle de visibilité construit en A7.3, mais défaut `SEMI_PRIVE` (pas `PRIVE`) ; 4 statuts (`PLANNED`/`IN_PROGRESS`/`ACHIEVED`/`FAILED`), aucune règle de transition imposée |
| A7.5 — Évaluation | ✅ | `PlayerEvaluation` + `PlayerEvaluationScore` | **Revu le 2026-07-06** : une évaluation est une session multi-critères (le coach note tous les critères actifs du club en un seul formulaire), pas une ligne par critère — première implémentation refaite avant tout commit après clarification du besoin. Backend en deux modules (schéma/migration additive, `evaluation-config` lecture seule des axes actifs du club, `player-evaluations` CRUD READ/CREATE/UPDATE/DELETE d'une session — pas de contrainte append-only, UPDATE remplace intégralement les scores, DELETE cascade —, `evaluatorId` auto-assigné, validation `assertCriteriaInClub` dédiée sur l'ensemble des critères soumis, filtres plage de dates + tri, permissions, 30 tests + smoke test Docker multi-rôles) + onglet frontend (radar dynamique recharts — N axes selon `ClubEvaluationConfig` du club, un point = moyenne par catégorie de la session la plus récente —, `outerRadius`/marges ajustés pour éviter la troncature des libellés de catégories longs, historique en **tableau** (une ligne par session, une colonne par catégorie, moyenne en chiffre sans étoiles), formulaire de saisie compact — critères groupés par catégorie en grille de 2-3 colonnes, tous obligatoires —, saisie en étoiles sur 5 avec demi-étoile via un nouveau composant `StarRatingInput`, 26 tests). `EvaluationCategory`/`EvaluationCriterion` déjà seedés depuis la Phase 1. Pas de champ `visibility` (contrairement à Notes/Objectifs) |

Ordre choisi : les deux entités les plus simples (CRUD seul, pas de modèle partagé) d'abord,
puis le duo Notes → Objectifs qui partage le modèle de visibilité, puis Évaluation en dernier
(le plus gros morceau d'UI — radar dynamique).

**Points à reconsidérer plus tard (pris en note pour ne pas les oublier)** :
- **Filtrage par saison/championnat** : `docs/schema/joueurs.md` §"Filtrage des statistiques par
  période" prévoit un filtrage par `Season`/`Championship` pour ces entités — impossible tant que
  la Phase 3 (Saisons & Championnats) n'existe pas. A7 ne livre que le filtrage par plage de
  dates libre ; le filtrage par saison/championnat est à ajouter rétroactivement en Phase 3.
- **`PlayerAbsence` (onglet Absence)** : retiré de la Partie A. Le construire nécessite le
  Calendrier (Partie B) et/ou les présences de Phases 4-5 (`MatchAttendance`,
  `TrainingAttendance`) — emplacement précis à trancher au moment d'attaquer la Partie B.
- **Onglet Dashboard** : reste en Phase 6, dépend des statistiques de match et d'entraînement
  (participations, titularisations, buts, passes décisives, clean sheets, cartons) qui
  n'existeront qu'après les Phases 4 et 5.
- **Onglet Blessure** : reste en Phase 8 (données de santé, traitement RGPD dédié).

Tests automatisés (avant A7) : 92 tests backend (Jest/NestJS) + 47 tests frontend (Jest/React
Testing Library — voir `docs/architecture.md` §6). A7.1 (Mesures) : 109 tests backend + 59
tests frontend au total. A7.2 (Entretien) : 136 tests backend + 78 tests frontend au total.
A7.3 (Notes) : 178 tests backend + 92 tests frontend au total. A7.4 (Objectifs), avec les
filtres de date ajoutés après coup sur Notes et Objectifs : 205 tests backend + 110 tests
frontend au total. A7.5 (Évaluation), après la refonte en session multi-critères : 235 tests
backend + 136 tests frontend au total. A8 : 250 tests backend + 136 tests frontend au total.
Plusieurs bugs réels ont été trouvés et corrigés en testant manuellement avec les 6
rôles (voir `docs/modules/auth-roles.md` §Patterns
découverts).

**Correctif de sécurité (avant A7.3)** : un Coach pouvait agir sur les mesures/entretiens/profils
de n'importe quel joueur du club en transmettant sa propre équipe en `?teamId=` — ni
`PlayersService`, ni `PlayerMeasurementsService`, ni `PlayerInterviewsService` ne vérifiaient que
le joueur ciblé appartient réellement à cette équipe (seulement au club). Corrigé via
`assertPlayerInTeam` avant de démarrer A7.3, avec tests de régression dédiés. 153 tests backend
au total après correctif. Voir `docs/modules/auth-roles.md` §Patterns découverts.

#### A8 — Tests multi-rôles bout-en-bout + revue de cohérence doc ↔ code

- **Test d'intégration consolidé** (`backend/src/common/effectif-multi-role.integration.spec.ts`,
  15 tests) : un seul membre (Marc) cumulant Coach équipe 5/Player équipe 8 (Club 1)/Parent
  (Club 2, `Member` distinct par club) exercé à travers les vrais guards/services des 5
  ressources Effectif (A7.1-A7.5) — pas seulement au niveau abstrait déjà couvert par
  `permissions.service.spec.ts`. Complète la règle multi-rôles obligatoire de
  `docs/modules/auth-roles.md` pour l'ensemble du module, pas module par module isolément.
- **Smoke test Docker en conditions réelles** (3 rôles × 5 endpoints) : création par un Coach,
  lecture filtrée par un Player (jamais de `PRIVE`/`staffAssessment`, écriture refusée), lecture
  et nettoyage par un AdminClub. A révélé un cas limite non trivial (voir ci-dessous).
- **Bug découvert (non corrigé, documenté)** : `PermissionsService.matchesContext()` exige une
  correspondance de `teamId` dès que le `MemberRole` de l'appelant en porte un — y compris pour
  une permission en scope `OWN`, qui ne devrait pourtant pas dépendre d'une équipe. Un Player
  omettant `?teamId=` reçoit un 403 même pour lire ses propres données. Sans impact aujourd'hui
  (la fiche joueur transmet toujours `teamId`), mais latent pour un futur client. Voir
  `docs/decisions-ouvertes-et-rgpd.md` #6 et `docs/modules/auth-roles.md` §Patterns découverts.
- **Revue de cohérence doc ↔ code** : plusieurs écarts trouvés et corrigés dans
  `docs/schema/joueurs.md` (`PlayerAbsence` documenté comme s'il existait déjà en base — annoté
  "pas encore implémenté" ; `PlayerEvaluation` doublé à tort dans la liste des index ; index de
  `PlayerEvaluationScore` manquants) et `docs/modules/effectif-joueurs.md` (référence morte vers
  `docs/schema-bdd.md` §16 — fichier déplacé depuis, corrigée vers `docs/schema/index.md` ;
  affirmation erronée que `trainingSessionId`/`matchId` existent en base sur `PlayerEvaluation`
  alors qu'ils sont entièrement différés ; deux sections "Évaluation" séparées et non
  adjacentes fusionnées en une seule).

### Partie B — Module Calendrier

Non commencée. Découpage établi le 2026-07-08 (planification, aucun code encore écrit).

**Décision — emplacement de `PlayerAbsence`** : construit dans cette partie (voir B8), pas
reporté aux Phases 4/5. Version minimale : schéma + CRUD + affichage dans le calendrier comme
période bloquée + réactivation de l'onglet Absence sur la fiche joueur (retiré en A7). Pas de
rapprochement automatique avec les convocations (`MatchAttendance`/`TrainingAttendance`
n'existent pas encore) — ce lien reste différé aux Phases 4/5, comme déjà documenté dans
`docs/schema/joueurs.md` §PlayerAbsence.

**Hors scope de cette partie** : logique de récurrence (`Event.isRecurring`/`recurringRuleId`
posés en base mais inertes — `RecurringRule` reste une entité future) ; notifications/rappels
(décision ouverte #2) ; rôle `Parent` non câblé (décision ouverte #5, même exclusion que
l'Effectif) ; `TrainingSession`/`Match` (extensions 1–1 de `Event`, Phases 4/5).

**Vues calendrier demandées** : mensuelle, hebdomadaire, liste — avec sélecteur de vue.

| Étape | Statut | Contenu |
|---|---|---|
| B0 — Prérequis transverse | ✅ | Permission `event` ajoutée au seed (READ/CREATE/UPDATE/DELETE scope TEAM pour Coach, CLUB pour AdminClub, ALL pour SuperAdmin/Proprietaire ; Player en READ/TEAM seul, même pattern que `team` — pas de scope OWN, un événement n'appartient à personne en particulier) + entrée `Calendrier` dans `frontend/src/components/layout/nav-modules.ts` (icône `Calendar`, `href` vers `/clubs/:clubId/calendar` — page pas encore créée, livrée en B4) + clés `nav.calendar` (fr/en) |
| B1 — Schéma `Event` | ✅ | Migration `add_event` + enum `EventType` (TRAINING/MATCH/OTHER), index `(teamId, startAt)`. `recurringRuleId` non ajouté (RecurringRule n'existe pas encore, même logique que `trainingSessionId` sur `PlayerNote`) — seul `isRecurring` (défaut `false`) est posé. Voir `docs/schema/evenements.md` |
| B2 — Backend `events` CRUD | ✅ | CRUD scopé équipe (`/clubs/:clubId/teams/:teamId/events`) — `teamId` dans l'URL (même pattern que `TeamStaff`), pas besoin du contournement `?teamId=` des ressources scopées joueur. Filtres `type`/`dateFrom`/`dateTo`/`sortOrder` sur le listing (résolus côté backend). 15 tests (service + intégration multi-rôles Coach/AdminClub/Player/sans-rôle) |
| B3 — Backend vue agrégée multi-équipes | ✅ | Route self-service `GET /clubs/:clubId/events/mine` (`EventsMineController`, même pattern que `teams/mine`/`players/me`) : scope CLUB/ALL voit tout le club, scope TEAM retombe sur les équipes où l'appelant a un `MemberRole`. Réponse enrichie de `team: { id, name }` (nécessaire au code couleur par équipe, vue AdminClub). 7 tests ajoutés (unitaires + intégration avec le vrai `PermissionsService`) — 275 tests backend au total |
| B4 — Frontend fondation calendrier + vue Liste | ✅ | Page `/clubs/:clubId/calendar`, filtres sidebar (cases à cocher type/équipe, résolus côté backend via `?types=`/`?teamIds=` — sélection vide affichée sans aller-retour réseau), vue **Liste** (timeline, même famille que Notes/Objectifs), dialogue création/édition (`EventFormDialog`, sélecteur d'équipe en création uniquement — équipe non modifiable en édition). Backend étendu : `FindMyEventsQueryDto` (CSV `types`/`teamIds`, distinct du `type` singulier de `findAllByTeam`). Nouveau composant `ui/checkbox.tsx` (Base UI) + polyfill `PointerEvent` dans `jest.setup.ts` (jsdom, nécessaire aux tests d'interaction Base UI). 12 tests frontend (dialogue + page) + 2 tests backend supplémentaires (filtre `teamIds`) |
| B5 — Vue Mensuelle | ✅ | `CalendarMonthView` : grille de 6 semaines, création au clic (mousedown+mouseup même jour) et par glisser (mousedown+mouseenter+mouseup, écouté sur `window` pour capter un relâchement hors grille) → `EventFormDialog` piloté en externe (nouveaux props `open`/`onOpenChange`/`defaultDate`/`defaultEndDate`, `trigger` devenu optionnel), clic sur un événement → édition. Palette catégorielle validée ajoutée aux tokens `--chart-1..8` (globals.css, jusque-là un placeholder gris inutilisé — skill dataviz, `references/palette.md`, ΔE 24.2 clair/10.3 sombre) ; `lib/calendar-color.ts` assigne type→3 premiers slots (Coach/Player) ou équipe→slot par position (AdminClub), repli neutre au-delà de 8. **Simplification documentée** : le mode de couleur (`type` vs `équipe`) est dérivé de `teams.length > 1` (proxy sur le nombre d'équipes accessibles), pas d'une détection de rôle réelle — non exposée côté frontend actuellement ; à revisiter si un futur cas (ex. Coach multi-équipes) s'avère mal servi par ce proxy. **Écart au découpage initial** : un sélecteur Liste/Mois (`Tabs`) a été ajouté dès B5 (prévu pour B7) — sans lui, la vue Mensuelle aurait été inatteignable et invérifiable en navigateur ; B7 l'étendra avec Hebdomadaire + persistance du choix. 9 tests frontend ajoutés (`calendar-month-view.test.tsx`, 6 + extensions `calendar-page-content.test.tsx`, 3) — 168 tests frontend au total |
| B6 — Vue Hebdomadaire | ✅ | `CalendarWeekView` : 7 jours (lundi-dimanche), mêmes briques que B5 — grille de jours extraite dans `CalendarGridDays` (partagée Mois/Semaine, plus de duplication du drag-to-select ni du code couleur), cellules plus hautes (une seule rangée). Aides de date communes dans `lib/calendar-grid.ts`. Troisième onglet ajouté au sélecteur Liste/Mois de B5. 7 tests ajoutés (5 `calendar-week-view.test.tsx` + 2 `calendar-page-content.test.tsx`) — 175 tests frontend au total. **Le sélecteur de vue à 3 voies existe donc déjà** ; B7 se limite désormais à la persistance du choix (pas de nouveau switcher à construire) |
| B7 — Sélecteur de vue | ✅ | Bascule Mensuel/Hebdomadaire/Liste déjà en place depuis B5/B6 (`Tabs`). Persistance ajoutée : `CalendarPageContent` lit `view`/`month`/`week` depuis les query params au montage (initialiseurs paresseux) et les réécrit via `router.replace` (`{ scroll: false }`, pas de nouvelle entrée d'historique par interaction) à chaque changement — un rechargement de page ou un lien partagé retombe sur la même vue/position plutôt que sur la Liste recentrée sur aujourd'hui. `useSearchParams` (`next/navigation`) combiné à `usePathname`/`useRouter` (`@/i18n/navigation`, locale-aware). 4 tests ajoutés (`calendar-page-content.test.tsx`) — 228 tests frontend au total. |
| B8 — `PlayerAbsence` | ✅ | Nouveau modèle `PlayerAbsence` (`reason`, `startDate`/`endDate` `@db.Date`, `isExcused?`, `reportedById?`) sans modèle de visibilité (contrairement à `PlayerNote`/`PlayerObjective`) — une absence n'a rien à cacher. CRUD scopé joueur (`clubs/:clubId/players/:playerId/absences`, permission `player_absence` OWN/TEAM/CLUB/ALL, mêmes conventions que `player_objective`). `AbsenceTab` réactivé sur la fiche joueur (liste/création/édition/suppression avec confirmation obligatoire, `alert-dialog.tsx`). **Écart au découpage initial, retour utilisateur (2026-07-08)** : un affichage calendrier (bandeau par absence dans les 3 vues + route agrégée `GET /clubs/:clubId/absences/mine`) a été construit puis entièrement retiré — un bandeau par personne grandit linéairement et devient invivable en période de vacances (7-10 absents simultanés vécu réellement par l'utilisateur) ; voir `docs/modules/calendrier-evenements.md` §Absences pour la décision détaillée et la piste retenue si repris un jour (indicateur agrégé par jour). `ExternalCalendar` (abonnement ICS) explicitement écarté du MVP, documenté pour référence future dans `docs/decisions-ouvertes-et-rgpd.md`. 25 tests backend ajoutés (`player-absences.service.spec.ts`, `player-absences-permissions.integration.spec.ts`) — 329 tests backend au total ; 18 tests frontend ajoutés (`AbsenceFormDialog`, `AbsenceTab`) — 246 tests frontend au total |
| B9 — Tests multi-rôles bout-en-bout | ⬜ | Scénario "Marc" (Coach/Player/Parent, voir `docs/modules/auth-roles.md` §Multi-rôles) appliqué au Calendrier + smoke test Docker + revue de cohérence doc ↔ code |

Ordre choisi : fondations schéma/CRUD d'abord (B1-B2), puis l'agrégation multi-équipe qui
conditionne toute vue calendrier (B3), puis le frontend en commençant par la vue la plus simple
(Liste, B4) avant la grille (Mensuelle B5, dont Hebdomadaire B6 est une variante), sélecteur de
vue en B7, `PlayerAbsence` greffé en avant-dernier comme une entité annexe (même position que
les onglets A7.x), tests multi-rôles en dernier (B9, miroir d'A8).

**Corrections post-revue visuelle (2026-07-08, sur B5/B6)** : premier retour en conditions
réelles (capture d'écran) de l'Entraîneur Daniel après B5/B6, quatre correctifs appliqués avant
de poursuivre :
- **Hauteur pleine page, sans scroll de page** : chaîne flexbox `lg:min-h-0`/`lg:flex-1` de
  `page.tsx` jusqu'aux vues (déjà le pattern des onglets Mesures/Évaluation en Effectif) — seules
  les zones internes défilent désormais (liste, cellule de grille mensuelle, grille horaire
  hebdomadaire).
- **Chaque vue borne désormais sa propre requête à sa plage affichée** (`lib/calendar-events-api.ts`,
  `fetchCalendarEvents`) — jusque-là `CalendarPageContent` chargeait tous les événements
  correspondant aux filtres sans borne de dates, quelle que soit la vue active. Mois/Semaine
  rechargent au changement de mois/semaine (ou de filtres, via `refreshKey`) ; toute mutation
  (création/édition/suppression) déclenche un rechargement via ce même `refreshKey`, plus de
  `load()` centralisé dans `CalendarPageContent`.
- **Vue Liste → scroll infini** (`CalendarListView`, nouveau composant) : fenêtre initiale de
  J-14 à J+60 autour d'aujourd'hui, extension par blocs de 30 jours au scroll (vers le haut =
  passé, vers le bas = futur), compensation du saut visuel au prepend (ajustement de `scrollTop`
  après ajout de contenu en haut).
- **Vue Hebdomadaire → grille horaire** (reconstruite, remplace l'ancienne grille de type Mensuel
  zoomée) : créneaux positionnés par heure (06h-23h, scroll interne), répartition côte-à-côte des
  événements qui se chevauchent (algorithme de voies glouton, pas un compactage optimal), bandeau
  dédié pour les événements multi-jours au-dessus de la grille. Simplification documentée : plus
  de glisser multi-jours dans cette vue (clic simple → un point précis dans le temps) — le glisser
  multi-jours reste disponible en vue Mensuelle.
- **Vue Mensuelle** : heure de chaque événement désormais affichée à côté du titre dans la cellule
  (`CalendarGridDays`).
- Correctif associé : `EventFormDialog.atDefaultHour` ne forçait pas la bonne heure — une date
  pré-remplie portant déjà une heure précise (clic dans la grille horaire Semaine) était écrasée
  à 9h ; ne s'applique désormais qu'aux dates à minuit (clic sur une cellule de jour, vue
  Mensuelle).
- `calendar-list-view.test.tsx` nouveau (6 tests) ; `calendar-month-view.test.tsx`,
  `calendar-week-view.test.tsx` et `calendar-page-content.test.tsx` largement réécrits pour le
  nouveau modèle de chargement par vue (chaque test mocke désormais `apiFetch` avec sa propre
  fenêtre de dates plutôt que de recevoir des `events` en prop) — 184 tests frontend au total.

**Corrections post-revue visuelle #2 (2026-07-08, sur B5/B6)** : deuxième retour (capture
d'écran) après les premières corrections, deux correctifs :
- **Vue Mensuelle → bandeau multi-jours** : un événement dont `startAt`/`endAt` tombent sur des
  jours différents n'apparaissait auparavant que comme une puce sur son seul jour de départ,
  sans indiquer qu'il s'étend sur plusieurs jours (déjà correct en vue Hebdomadaire).
  `CalendarGridDays` restructuré : la grille de 42 jours est découpée en 6 blocs "semaine"
  (`flex flex-col`, chacun `flex-1`), chaque bloc affichant un bandeau optionnel au-dessus de
  ses cellules pour les événements multi-jours qui le traversent — même algorithme de voies
  glouton que le chevauchement horaire de la vue Hebdomadaire, appliqué ici à des colonnes de
  jours (`isMultiDay` déplacé dans `lib/calendar-grid.ts`, partagé Mois/Semaine).
- **Bouton "Aujourd'hui"** : recentre la vue active. Mois/Semaine se recentrent directement via
  leur état de navigation (`setMonth`/`setWeek(new Date())`) ; la vue Liste n'a pas d'état de
  navigation équivalent (fenêtre de scroll ouverte progressivement) — nouveau prop
  `recenterKey` sur `CalendarListView`, incrémenté par le bouton, qui efface la fenêtre
  mémorisée pour forcer un retour à la fenêtre initiale centrée sur aujourd'hui (au lieu du
  comportement `refreshKey` habituel qui préserve la fenêtre ouverte).
- 8 tests ajoutés (bandeau multi-jours, recentrage Liste et Mois) — 187 tests frontend au total.

**Corrections post-revue visuelle #3 (2026-07-08, sur B5/B6)** : troisième retour (capture
d'écran) — le bandeau multi-jours de la correction #2 s'affichait entre deux semaines plutôt que
dans les cellules qu'il traverse. Deux correctifs :
- **Bandeau repositionné à l'intérieur des cellules** : `CalendarGridDays` restructuré une
  deuxième fois — chaque semaine est désormais un conteneur `relative` contenant la grille des 7
  cellules ET une superposition (`position: absolute`) de bandeaux alignée sur les mêmes colonnes
  (`grid-cols-7 gap-px` identique des deux côtés). Chaque cellule réserve un espace vide
  (`DAY_NUMBER_AREA_PX` + `laneCount × BANNER_LANE_HEIGHT_PX`) juste sous son numéro de jour pour
  que la superposition s'y intercale visuellement sans recouvrir le contenu de la cellule. Le
  glisser (drag-to-select) reste sur les cellules ; les boutons de bandeau interceptent le clic
  (`pointer-events-auto` sur un conteneur `pointer-events-none`) sans déclencher de sélection.
- **Numéro de semaine ISO 8601** : `getIsoWeekNumber` ajouté à `lib/calendar-grid.ts` (algorithme
  standard "semaine du jeudi"), affiché dans une gouttière `w-5` à gauche de chaque semaine — même
  gouttière ajoutée à l'en-tête des jours dans `CalendarMonthView` pour l'alignement des colonnes.
- 2 tests ajoutés (bandeau superposé à l'intérieur du bon bloc de semaine, numéro de semaine) —
  189 tests frontend au total.

**Événements récurrents (2026-07-08)** : demande explicite (pas dans le découpage B1-B9 initial —
`Event.isRecurring`/`recurringRuleId` avaient été posés en base dès B1 comme "future entité", ce
moment est arrivé). Décision structurante : **pas de nouvelle entité `RecurringRule`**. Le
frontend calcule la liste concrète des dates d'occurrence à la validation du formulaire
(`lib/recurrence.ts`) et le backend crée chaque occurrence comme un `Event` indépendant
(`isRecurring = true`, sans lien de groupe entre elles) via un nouvel endpoint bulk — pas de règle
vivante réévaluée dynamiquement, conforme à la demande ("créer tous les événements en question
entre les dates de récurrence").
- **Backend** : `POST /clubs/:clubId/teams/:teamId/events/bulk` (`CreateEventsBulkDto`, tableau de
  `CreateEventDto` validé, `@ArrayMaxSize(200)`), `EventsService.createBulk` (`prisma.event.createMany`
  en une requête). Même permission `event CREATE` que la création simple. 6 tests ajoutés (service +
  intégration multi-rôles) — 280 tests backend au total.
- **Frontend — `lib/recurrence.ts`** (pur, testé indépendamment de l'UI) : `computeOccurrenceDates(rule,
  rangeStart, rangeEnd)` pour 3 types de règle — hebdomadaire (jours de semaine cochés), mensuel
  (jour fixe du mois OU Nième/dernier jour de semaine du mois), annuel (date fixe OU Nième/dernier
  jour de semaine d'un mois donné). Garde-fou `MAX_OCCURRENCES = 200` (même borne que le backend).
  11 tests.
- **Frontend — `EventFormDialog`** : case "Événement récurrent" (création uniquement, absente en
  édition — éditer une occurrence n'a pas de sens en tant que série) qui remplace les champs
  Début/Fin normaux par heure de début/fin (communes à toutes les occurrences) + sélecteur de type
  de récurrence + champs spécifiques au type + plage de dates de la récurrence. Aperçu du nombre
  d'occurrences recalculé en direct (`useMemo` sur les valeurs surveillées). À la soumission :
  calcule les dates, construit un événement par date (même heure/lieu/description), envoie tout à
  l'endpoint bulk en une requête. 5 tests ajoutés — 204 tests frontend au total.

**Édition/suppression en masse des événements récurrents + confirmation de suppression
(2026-07-08)** : demande explicite suite aux événements récurrents ci-dessus — édition d'une
occurrence doit proposer "cet événement seulement" ou "cet événement et les suivants" (jamais les
occurrences passées), et **toute** suppression (récurrente ou non) doit être confirmée (aucune
validation n'existait auparavant — risque d'erreur humaine signalé explicitement). Décision
structurante : ajout de `Event.recurringGroupId` (UUID, nullable, migration
`add_event_recurring_group`) — un seul identifiant généré par lot dans `createBulk`, partagé par
toutes les occurrences de ce lot, permettant de retrouver "cet événement et les suivants" sans
entité `RecurringRule` dédiée (décision initiale du 2026-07-08 ci-dessus inchangée).
- **Backend** : `PATCH`/`DELETE .../events/:id` acceptent `?scope=single|future` (`single` par
  défaut, comportement historique inchangé). En scope `future`, seuls titre/type/lieu/description/
  heure se propagent aux occurrences trouvées (`recurringGroupId` égal + `startAt >= ancre`) ; la
  date de chacune est préservée via `combineDateWithTime`. Retombe silencieusement sur `single` si
  l'événement n'appartient à aucun lot récurrent. 4 tests service ajoutés — 284 tests backend au
  total. Pas de nouveau test de permission dédié : `scope` ne change pas le modèle RBAC (même
  `@RequirePermission` qu'avant), voir `docs/schema/evenements.md`.
- **Frontend — `components/ui/alert-dialog.tsx`** (nouveau, mirroir de `dialog.tsx` sur
  `@base-ui/react/alert-dialog`) : primitives brutes sans boutons Action/Cancel imposés — chaque
  appelant compose son propre jeu de boutons (2 pour une confirmation simple, 3 pour le choix
  "cet événement seulement / et les suivants / annuler").
- **Frontend — `DeleteEventDialog`** (nouveau) : confirmation systématique avant toute suppression,
  seul point d'entrée de suppression du calendrier (`CalendarListView`). Affiche une simple
  confirmation pour un événement isolé, ou le choix single/future pour un événement récurrent.
- **Frontend — `EventFormDialog`** : soumission d'une édition (`mode="edit"`) sur un événement
  récurrent n'envoie plus le `PATCH` immédiatement — un `AlertDialog` demande le périmètre
  (single/future) avant d'appeler `performSubmit`. Édition d'un événement non récurrent : inchangée,
  PATCH direct avec `scope=single`.
- `ExistingEvent.isRecurring` ajouté (le champ existait déjà côté API, seul le type frontend
  manquait). 4 tests ajoutés (3 `event-form-dialog.test.tsx`, 1 `calendar-list-view.test.tsx`, plus
  fixtures existantes mises à jour) — 208 tests frontend au total.

---

## Phase 3 — Saisons & Championnats ⬜

_~2–3 semaines_

- `Season` (états DRAFT/ACTIVE/ARCHIVED), `Championship`, `ChampionshipParticipant`,
  `ChampionshipMatch`, `ExternalTeam`.
- Wizard de création de saison (import roster, confirmation, activation).
- Configuration du format de jeu et des règles de points par championnat.
- Presets de règles de départage + configuration personnalisée.
- Saisie des résultats des matchs adverses.
- Classement calculé à la volée.
- Filtrage des statistiques joueur par saison / championnat / catégorie / dates libres.

---

## Phase 4 — Matchs (notre équipe) ⬜

_~3 semaines_

- `Match`, `MatchPeriod`, `MatchLineup`, `MatchEvent`, `MatchAttendance`, `MatchPlayerRating`.
- Préparation de la composition, convocations de match.
- **Gestion live** : lancement des périodes (timestamps serveur), saisie des événements
  (buts avec buteur/passeur, cartons, remplacements), clôture du match.
- Lien `Match.championshipMatchId` → `ChampionshipMatch` : mise à jour automatique du score
  du championnat à la clôture.
- Évaluation collective et individuelle post-match.
- Statistiques match : buts, assists, temps de jeu, cartons (calculés depuis `MatchEvent`).
- Alimente le futur Dashboard joueur (Phase 6) et potentiellement `PlayerAbsence` (voir décision
  du 2026-07-06, note Partie A/étape A7 ci-dessus et `docs/modules/effectif-joueurs.md`).

---

## Phase 5 — Entraînement & Exercices ⬜

_~4 semaines_

- `TrainingSession`, `Exercise`, `TrainingSessionExercise`, `TrainingAttendance`,
  `TrainingFeedback`.
- Bibliothèque d'exercices + éditeur graphique (placement de joueurs, tracé de flèches).
- Évaluation globale de séance + évaluation joueurs liée à la séance.
- Feedback joueur avec fenêtre d'édition définie par l'entraîneur.
- Alimente le futur Dashboard joueur (Phase 6) et potentiellement `PlayerAbsence` (voir décision
  du 2026-07-06, note Partie A/étape A7 ci-dessus et `docs/modules/effectif-joueurs.md`).

---

## Phase 6 — Dashboard joueur ⬜

_Quelques jours — phase largement réduite par la décision du 2026-07-06 (voir Partie A/étape A7
dans Phase 2) : `PlayerMeasurement`, `PlayerEvaluation`, `PlayerObjective`, `PlayerInterview` et
le modèle de visibilité Privé/Semi-privé/Public sont avancés à la Partie A._

- Dashboard joueur : agrégation des stats Matchs (Phase 4) + Entraînement (Phase 5) — stats
  clés (participations, titularisations, buts, passes décisives, clean sheets, cartons),
  dernières évaluations, objectifs en cours.
- Ne peut pas commencer avant que les Phases 4 et 5 existent (dépendance directe).
- `PlayerAbsence` retiré de cette phase — voir note Partie A/étape A7 : construit avec le
  Calendrier/présences (Partie B et/ou Phases 4-5).
- Statistiques filtrables par Season ou Championship (nécessite la Phase 3).

---

## Phase 7 — Scouting ⬜

_~3 semaines_

- `TeamScoutingReport`, `PlayerScoutingReport`, `PlayerScoutingCriterion`,
  `PlayerScoutingEvaluation`, `PlayingStyleTag`, `ExternalPlayer`.
- Rapport d'équipe : système de jeu, 6 phases de jeu, synthèse, tags de style.
- Rapport de joueur : évaluation par critères sur 4 dimensions, synthèse, bloc recrutement.
- ExternalPlayer nullable (sans équipe connue), assignable plus tard.
- Tags libres scopés au club (réutilisables).
- Lien optionnel entre les deux types de rapports.
- Preset de rôle "Recruteur" configuré comme rôle dynamique exemple.

---

## Phase 8 — Blessures & Rééducation ⬜

_~2 semaines_

- `Injury`, `InjuryAssignment`, `InjuryRehabEvent`.
- Timeline de rééducation, intervenants multiples.
- Statut blessé/rétabli intégré à l'effectif et aux convocations.
- Historique et statistiques de récidive.

---

## Phase 9 — Finitions MVP & tests ⬜

_~2 semaines_

- Gestion des rôles personnalisés (interface de création + attribution de permissions).
- Mécanisme de transfert sécurisé du rôle Propriétaire.
- Connexion de tous les modules (présences → stats, statut blessé → convocations...).
- Navigation contextuelle par rôle (menus adaptés selon rôles actifs).
- Tests multi-rôles systématiques sur chaque module.
- Tests avec utilisateurs pilotes.

---

## Total estimé MVP

~4,5 mois de développement actif (Phases 1 à 9). Une beta après la Phase 4 (matchs live
fonctionnel) est envisageable pour recueillir des retours avant les phases de profil, scouting
et blessures.

---

## Évolutions post-MVP

- Notifications (email, push, in-app) — actuellement en décision ouverte.
- FAIR_PLAY : saisie manuelle de points de pénalité (post-MVP).
- Live match multi-utilisateur (co-gestion en temps réel).
- Modules organisationnels : covoiturage parents, cotisations/finances, gestion des licences.
- Espace communautaire : fil d'actualité, photos/vidéos, messagerie.
- Bibliothèques d'exercices partagées (club → publique → place de marché).
- Statistiques avancées et analyses automatisées.
- Multi-club (vue agrégée pour un Propriétaire sur plusieurs clubs).
- Extension à d'autres sports.
