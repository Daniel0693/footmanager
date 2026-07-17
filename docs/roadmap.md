# Roadmap — FootManager

> À mettre à jour au fur et à mesure de l'avancement réel.
> Le détail d'implémentation de chaque fonctionnalité vit dans `docs/modules/` et
> `docs/schema/` ; ce fichier ne garde que le statut et les décisions de planning.

Légende : ⬜ pas commencé · 🚧 en cours · ✅ terminé

---

## Phase 1 — Fondations du projet ✅

Repository, Docker (backend NestJS, db PostgreSQL, frontend Next.js), i18n (next-intl),
entités de base (`User`, `RefreshToken`, `Club`, `Team`, `Member`, `MemberRole`, `Role`,
`Permission`, `RolePermission`), auth (inscription/connexion/refresh/silent refresh), seed
système (rôles, permissions, `EvaluationCategory`/critères football, `PlayingStyleTag`,
`PlayerScoutingCriterion`). Génération auto des `ClubEvaluationConfig` selon `Club.sport` à la
création d'un club.

> Complété le 02/07/2026. Monorepo `backend/`/`frontend/`, Docker Compose pour le dev local,
> PostgreSQL + Prisma, Next.js + TailwindCSS + TypeScript + shadcn/ui.

---

## Phase 2 — Effectif & Calendrier ✅

_Révisée à la hausse le 2026-07-06 (A7 avance 4 entités depuis la Phase 6 dans la Partie A)._

`PlayerProfile`/`PlayerTeam`/`TeamStaff` (effectif), `Event` (calendrier), code couleur par
type/équipe. `ExternalTeam` reporté à la Phase 3. Présences/convocations reportées à
`MatchAttendance` (Phase 4)/`TrainingAttendance` (Phase 5) — pas un `Event` générique. Rôle
`Parent` non câblé sur ce module (décision ouverte #5, liaison Parent↔Joueur non modélisée).

### Partie A — Module Effectif ✅

| Étape | Contenu |
|---|---|
| Prérequis transverse | `PermissionsGuard` + `@RequirePermission` — `docs/modules/auth-roles.md` |
| Schéma | `PlayerProfile`, `PlayerTeam`, `TeamStaff`, enum `Position` (15 postes) |
| Backend | `players` (CRUD + `/me`), `player-teams`, `team-staff`, `teams` (+ `/mine`), `clubs` (liste scopée), `members` (création/édition sans compte) |
| Frontend | Liste effectif (filtres ligne/poste), fiche joueur 2 colonnes (infos statiques + sélecteur de poste visuel terrain interactif) |
| **A7 — Profil joueur enrichi** | Contenu réel des 5 onglets, un par un — voir sous-étapes ci-dessous. Décision du 2026-07-06 |
| A8 — Tests multi-rôles bout-en-bout | Scénario complet + revue de cohérence doc ↔ code |

#### Sous-étapes A7 — une entité à la fois

Ordre choisi : les deux entités les plus simples d'abord (CRUD seul), puis Notes → Objectifs
(modèle de visibilité partagé), puis Évaluation en dernier (le plus gros morceau d'UI).
Détail complet de chaque onglet : `docs/modules/effectif-joueurs.md`.

| Sous-étape | Entité | Résumé |
|---|---|---|
| A7.1 — Mesures | `PlayerMeasurement` | CRUD append-only (pas d'UPDATE), graphique 2 courbes + tableau, filtres/tri backend partagés |
| A7.2 — Entretien | `PlayerInterview` | Timeline, planifiable à l'avance puis complété après coup, `staffAssessment` jamais visible du joueur |
| A7.3 — Notes | `PlayerNote` | Introduit le modèle de visibilité Privé/Semi-privé/Public ; première ressource à appliquer `assertPlayerInTeam` |
| A7.4 — Objectifs | `PlayerObjective` | Réutilise le modèle de visibilité (défaut Semi-privé), 4 statuts sans transition imposée |
| A7.5 — Évaluation | `PlayerEvaluation` + `PlayerEvaluationScore` | Revu le 2026-07-06 : session multi-critères (pas une ligne par critère), radar dynamique selon `ClubEvaluationConfig` du club |

**Points reportés (à ne pas oublier)** :
- **Filtrage par saison/championnat** des 5 entités A7.x : impossible avant la Phase 3, prévu
  en rétro-ajout (voir `docs/schema/joueurs.md` §"Filtrage des statistiques par période").
- **`PlayerAbsence`** : retiré de la Partie A, construit en Partie B (B8).
- **Onglet Dashboard** : Phase 6 (dépend des stats Matchs/Entraînement).
- **Onglet Blessure** : Phase 8 (RGPD dédié).

**Correctif de sécurité (avant A7.3)** et **tests multi-rôles A8** (scénario Marc,
Coach/Player/Parent sur 3 scopes) : voir `docs/modules/auth-roles.md` §Patterns découverts pour
le détail (`assertPlayerInTeam`, limites de `matchesContext()` sur le scope `OWN`).

Tests à la fin de la Partie A (après A8) : 250 tests backend + 136 tests frontend.

### Partie B — Module Calendrier ✅

Découpage établi le 2026-07-08. **Décision** : `PlayerAbsence` construit ici (B8), pas reporté
aux Phases 4/5 — schéma + CRUD + onglet Absence sur la fiche joueur ; l'affichage calendrier
prévu initialement a finalement été retiré après retour utilisateur (voir
`docs/modules/calendrier-evenements.md` §Absences). Pas de rapprochement automatique avec les
convocations (`MatchAttendance`/`TrainingAttendance` n'existent pas encore).

Hors scope : récurrence en base (posée mais implémentée sans nouvelle entité, voir plus bas) ;
notifications/rappels (décision ouverte #2) ; rôle `Parent` non câblé (décision ouverte #5) ;
`TrainingSession`/`Match` (Phases 4/5). Vues demandées : mensuelle, hebdomadaire, liste.

| Étape | Contenu |
|---|---|
| B0 — Prérequis | Permission `event` au seed, entrée nav `Calendrier` |
| B1 — Schéma `Event` | Migration, enum `EventType`, index `(teamId, startAt)` — `docs/schema/evenements.md` |
| B2 — Backend `events` CRUD | Scopé équipe (`teamId` dans l'URL), filtres type/dates/tri |
| B3 — Backend vue agrégée | `GET /clubs/:clubId/events/mine` (self-service multi-équipes) |
| B4 — Frontend fondation + vue Liste | Filtres sidebar, dialogue création/édition |
| B5 — Vue Mensuelle | Grille 6 semaines, création clic/glisser |
| B6 — Vue Hebdomadaire | Grille 7 jours, briques partagées avec B5 |
| B7 — Sélecteur de vue | Persistance du choix (query params) |
| B8 — `PlayerAbsence` | CRUD scopé joueur, onglet Absence réactivé — `docs/modules/calendrier-evenements.md` §Absences |
| B9 — Tests multi-rôles bout-en-bout | Scénario Marc (miroir A8) + smoke test Docker + revue de cohérence doc ↔ code |

Ordre choisi : schéma/CRUD (B1-B2), agrégation multi-équipe (B3), frontend du plus simple (Liste
B4) au plus complexe (grille Mensuelle B5, Hebdomadaire B6 en variante), sélecteur de vue (B7),
`PlayerAbsence` en avant-dernier, tests multi-rôles en dernier (B9).

**Fonctionnalités ajoutées après le découpage initial, sur retour utilisateur (2026-07-08)** :
récurrence des événements (sans nouvelle entité `RecurringRule`), édition/suppression en masse
d'une série + confirmation systématique de suppression, mécanique de rendu des vues (scroll
infini, grille horaire, bandeaux multi-jours, numéro de semaine ISO). Détail complet dans
`docs/modules/calendrier-evenements.md` §Récurrence / §Édition et suppression en masse / §Rendu
des vues. Décision d'architecture (`Event.recurringGroupId`, pas de `RecurringRule`) :
`docs/schema/evenements.md`.

**Correctifs post-B9 (2026-07-09)**, trouvés en conditions réelles avec les comptes de dev —
anniversaires invisibles/dupliqués en vue Liste, auto-déclaration d'absence par un joueur,
`PlayerAbsence.reason` passé en enum fermé, boutons d'action masqués pour un joueur consultant
sa propre fiche, mise en page des filtres Mesures. Détail : `docs/modules/calendrier-evenements.md`
§Anniversaires/§Absences et `docs/modules/effectif-joueurs.md` §Boutons d'action masqués/§Mesures.

Tests à la fin de la Partie B (après B9 + correctifs) : 340 tests backend + 259 tests frontend.

---

## Phase 3 — Saisons & Championnats ✅

_~2–3 semaines_

Découpage établi le 2026-07-13, sur le modèle de la Phase 2 (Partie A / Partie B, incréments
granulaires, une branche `feature/` par partie, mergée dans `develop` seulement une fois
entièrement terminée et testée). Conception fonctionnelle complète (schéma, wizard, droits,
algorithme de classement) déjà figée dans `docs/schema/championnats.md` et
`docs/modules/saisons-championnats.md` avant le premier incrément.

**Hors scope explicite** : `ExternalPlayer` (Phase 7 Scouting, malgré sa présence dans le même
fichier `docs/schema/championnats.md`) ; `Match`/gestion live (Phase 4) — toutes les rencontres
de championnat, y compris les nôtres, sont saisies manuellement sur `ChampionshipMatch` en
attendant Phase 4 (`matchId` posé nullable dès maintenant, sans `@relation`, pour la migration
future).

### Partie A — Module Season ✅

| Étape | Contenu |
|---|---|
| A0 | Prérequis transverse (seed permissions, nav, i18n) |
| A1 | Schéma `Season` (scopée équipe à l'origine — voir révision A14 ci-dessous) |
| A2 | Backend `seasons` CRUD scopé équipe |
| A3 | Frontend liste des saisons |
| A4 | Composant `Stepper` générique (débranché de Season depuis A17, reste disponible) |
| A5 | Frontend wizard étape 1 (création DRAFT) — **supprimé en A17** |
| A6 | Backend import roster (étape 2) — **supprimé en A15** |
| A7 | Frontend wizard étape 2 (import roster) — **supprimé en A17** |
| A8 | Wizard étape 3 — placeholder — **supprimé en A17** (Championship ne dépendra plus du wizard, voir révision) |
| A9 | Backend activation (étape 4) — repliée dans `SeasonsService.activate` en A15 |
| A10 | Frontend wizard étape 4 (résumé + activation) — **supprimé en A17** |
| A11 | Frontend détail de saison + édition |
| A12 | Filtrage rétroactif par saison des 5 entités A7.x (Phase 2) |
| A13 | Tests multi-rôles bout-en-bout Partie A |

Détail complet de chaque étape : voir le plan de développement archivé au moment de la
conception de la Phase 3 et `docs/modules/saisons-championnats.md`.

#### Révision A14-A19 — Saisons au niveau du club

Retour utilisateur après A13 : toutes les équipes d'un club partagent le même calendrier de
saisons — avoir une `Season` distincte par équipe (conception A0-A13) dupliquait une
information censée être unique pour le club. Révision effectuée avant le démarrage de la
Partie B pour ne pas construire `Championship` sur le mauvais modèle.

| Étape | Contenu |
|---|---|
| A14 | Schéma : `Season.teamId`→`clubId`, suppression `teamNameSnapshot`/`categorySnapshot` (jamais alimentés), migration destructive (données de dev réinitialisées), permissions (Coach perd l'écriture) |
| A15 | Backend `seasons` : routes/service club-wide, activation repliée dans `SeasonsService` (suppression de `SeasonRosterImportService`/`SeasonActivationService`), contrôle de non-chevauchement des dates, `resolveSeasonPeriod` scopé club |
| A16 | Backend Effectif : recherche club-wide de joueurs (`PlayersService.findAllByClub` + `search`), base du transfert entre équipes |
| A17 | Frontend : routes déplacées vers `clubs/:clubId/seasons/**`, wizard/`Stepper` retirés, création/édition via `SeasonFormDialog` (modale, cohérence avec le reste de l'app — retour utilisateur explicite), activation en action ponctuelle |
| A18 | Frontend : sélecteur "Joueur existant du club" dans `PlayerFormDialog` (recherche affichée **par défaut**, avant "Nouveau joueur" — retour utilisateur), pour les promotions/transferts entre équipes (ex. U15→U16) sans recréer le profil — **révisé le 2026-07-16** : sélecteur manuel remplacé par une détection automatique Nouveau/Modification/Réactivation partagée avec la création manuelle et le futur import fichier, voir `docs/modules/effectif-joueurs.md` §Rapprochement joueur |
| A19 | Docs (ce bloc) + retest multi-rôles + vérification bout-en-bout |
| A20 | Correctif : Coach/Player ne pouvaient pas charger la liste des saisons (bug, pas une limite de droits — le frontend ne transmettait jamais `?teamId=` sur une page club-wide sans contexte équipe naturel, voir `resolveAnyTeamId` dans `docs/modules/auth-roles.md` §"Patterns découverts") ; `canManage` (backend) masque les boutons Nouvelle saison/Modifier/Activer/Supprimer pour un rôle en lecture seule ; masquage du lien "Saisons" dans la sidebar pour un rôle sans aucun droit dessus (ex. Parent, 403) ; colonne Actions (menu ⋮ — Activer/Modifier/Supprimer) ajoutée à la liste des saisons pour éviter de systématiquement ouvrir la fiche détail (retour utilisateur) |

**Pourquoi le wizard a disparu** : `Championship` (Partie B) sera créé par les Coachs,
par équipe, de façon récurrente et découplée de la création de la saison — une équipe de
jeunes peut avoir plusieurs championnats sur une même saison (ex. "Championnat d'Automne" et
"Championnat du Printemps"). Regrouper "créer la saison" et "configurer les championnats"
dans un seul wizard séquentiel n'avait donc plus de sens une fois `Season` club-wide.
`PlayerTeam` n'ayant pas de FK directe vers `Season`, l'étape "importer le roster" a aussi
disparu : les mouvements de joueurs entre équipes (départs, arrivées, promotions) se gèrent
au fil de l'eau via l'Effectif (voir A16/A18), pas via une cérémonie annuelle en bloc.

Scénario multi-rôles bout-en-bout (A13, réécrit en A15 pour le modèle club-wide —
docs/modules/auth-roles.md §"Multi-rôles — règle de test obligatoire") :
`backend/src/common/season-multi-role.integration.spec.ts` — un persona AdminClub crée/active
une saison club-wide en flux réel ; Coach et Player (Marc) n'ont que la lecture (via
`?teamId=`, depuis A14) et filtrent leur profil par une saison partagée entre leurs équipes,
sans pouvoir lire les bornes d'une saison d'un **autre club** (404) ; Parent Club B aucun accès
à `season` ni au filtrage par saison.

Tests à la fin de la Partie A (après révision A14-A20) : 449 tests backend + 428 tests frontend.

### Partie B — Module Championship ✅

| Étape | Contenu |
|---|---|
| B0 | Prérequis transverse (seed + doc pattern ExternalTeam) ✅ |
| B1 | Schéma `ExternalTeam` ✅ |
| B2 | Backend `external-teams` CRUD ✅ |
| B3 | Frontend gestion des équipes adverses + nouvelle entrée nav "Championnats" (scopée équipe, décidée avec l'utilisateur — remplace l'hypothèse initiale d'un onglet sous Saisons, devenue caduque après la révision A14) ✅ |
| B4 | Schéma `Championship` ✅ |
| B5 | Backend `championships` CRUD + presets (route adaptée à teamId dans l'URL, `seasonId` en body — voir B4) ✅ |
| B6 | Frontend `championships` liste + formulaire règles ✅ |
| B7 | Schéma `ChampionshipParticipant` ✅ |
| B8 | Backend `championship-participants` CRUD ✅ |
| B9 | Frontend onglet Participants (fiche championnat, nouvelle route) ✅ |
| B10 | Schéma `ChampionshipMatch` ✅ |
| B11 | Backend `championship-matches` CRUD (saisie résultats) ✅ |
| B12 | Algorithme de classement (fonction pure) + endpoint ✅ |
| B13 | Frontend calendrier des rencontres + saisie résultats ✅ |
| B14 | Frontend classement ✅ |
| B15 | Tests multi-rôles bout-en-bout Partie B + clôture ✅ |

Démarre sur une branche `feature/saisons-module-championship` séparée, une fois la Partie A
mergée dans `develop`.

Scénario multi-rôles bout-en-bout (B15, docs/modules/auth-roles.md §"Multi-rôles — règle de
test obligatoire") : `backend/src/common/championship-multi-role.integration.spec.ts` — même
persona Marc (Coach équipe 5/Player équipe 8/Parent Club B). Marc-Coach gère un championnat de
bout en bout en flux réel (équipe adverse → championnat → participants → rencontre → résultat →
classement calculé, vérifié valeur par valeur), refusé sur l'équipe 8 où il n'est que Player ;
Marc-Player lit championnats/participants/rencontres/classement de sa propre équipe en lecture
seule (`canManage=false`), sans accès à `external_team` (Coach seul) ; Marc-Parent (Club B)
n'a aucun accès aux 4 ressources — écart assumé avec la conception initiale qui envisageait un
`READ TEAM` pour Parent, jamais câblé dans le seed final (voir §Points reportés ci-dessous et
`docs/modules/saisons-championnats.md` §Droits par rôle).

**Rebranchement A8, plus applicable** : l'étape A8 du plan initial (wizard Season étape 3,
placeholder à remplacer par un vrai `ChampionshipFormDialog`) a été supprimée dès la révision
A17 — le wizard Season n'existe plus du tout depuis que `Season` est devenue club-wide (A14).
Rien à rebrancher en B15.

**Points reportés (à ne pas oublier)** :
- **Écart de droits Parent, assumé** : la conception initiale de la Partie B (§B0) envisageait
  un `READ TEAM` pour Parent sur `championship`/`championship_participant`/`championship_match`
  au même titre que Player ("nécessaire pour le classement"). Le seed final (`backend/prisma/
  seed.ts`) ne l'a jamais câblé — Parent n'a que `member READ OWN`, cohérent avec le constat déjà
  documenté que le rôle Parent n'est pas branché à un `MemberRole` fonctionnel dans le MVP (voir
  `docs/decisions-ouvertes-et-rgpd.md` §5). À revoir si Parent devient un rôle réellement utilisé.
- ~~`Championship` doit porter son propre `teamId`, en plus de `seasonId`~~ — **tranché et
  implémenté en B4** : `Championship.teamId` + `Championship.seasonId`, sans contrainte
  d'unicité entre les deux (une équipe peut avoir plusieurs championnats sur une même saison).
  Voir `docs/schema/championnats.md` §Championship.
- Filtrage des 5 entités A7.x par **championnat précis** (`WHERE championshipMatchId...`) :
  non applicable, ces entités n'ont aucune FK directe vers `ChampionshipMatch` — seul le
  filtrage par saison (bornes de dates) est implémenté en A12.
- Filtrage par **catégorie d'âge** : différé — le champ `Season.categorySnapshot` envisagé en
  conception n'a jamais été implémenté (aucun formulaire ne l'exposait) et a été retiré du
  schéma en A14 (n'aurait plus de sens au niveau club, qui regroupe plusieurs équipes de
  catégories différentes). Voir `docs/schema/joueurs.md` §Filtrage des statistiques par période.
- `ChampionshipParticipant.internalTeamId` restreint à la `teamId` de l'URL (une seule équipe
  interne par championnat créé depuis cette équipe) — limite MVP, deux équipes du même club
  dans le même championnat hors scope.

Tests à la fin de la Partie B (après B15) : 533 tests backend + 487 tests frontend — clôture de
la Phase 3 (Parties A et B confondues, la branche B ayant repris directement là où A s'est
arrêtée).

#### B16 — Refonte UX (retour utilisateur post-clôture)

Retour utilisateur après B15, avant merge dans `develop` : les onglets des fiches
championnat et saison n'étaient pas le bon format — trop de clics pour une info dense
(classement + calendrier) ou trop peu de contenu pour en justifier un (fiche saison,
seulement 2 dates). Trois changements, tous en frontend + un endpoint backend :

- **Fiche championnat** : plus d'onglets. Classement (B14, inchangé) en colonne principale
  (3/4), calendrier compact en colonne latérale (1/4) — liste triée par date (pas par
  journée), une ligne par rencontre (journée/date/équipe domicile+score/équipe extérieur+score),
  mise en valeur des rencontres impliquant l'équipe propriétaire du championnat pour un repérage
  immédiat. L'onglet Participants a disparu (le classement liste déjà toutes les équipes
  participantes, B14) — sa gestion (ajout/retrait) reste possible via une modale dédiée
  (`ParticipantsDialog`, réutilise `ParticipantsTab` tel quel), pas un onglet.
- **Équipes adverses réutilisables d'une saison à l'autre** : déjà le comportement existant
  (`ExternalTeam` est scopée au *club*, pas au championnat ni à la saison — voir
  `docs/schema/championnats.md` §ExternalTeam) — le sélecteur d'ajout de participant liste déjà
  toutes les équipes adverses du club, quelle que soit la saison où elles ont été créées. Aucun
  changement de code nécessaire, confirmé avec l'utilisateur.
- **Fiche saison** : plus d'onglets. Dates de début/fin en petite colonne (1/4), championnats de
  la saison — toutes équipes du club confondues — en colonne large (3/4), chacun lié à sa fiche
  championnat. Nouvel endpoint `GET /clubs/:clubId/seasons/:seasonId/championships`
  (`SeasonChampionshipsController`, permission `championship READ` sans `?teamId=` : seul un
  scope CLUB/ALL — AdminClub+ — y a accès, cohérent avec l'usage principal signalé par
  l'utilisateur ; un Coach/Player reçoit un 403 traité côté frontend comme "rien à afficher",
  pas une erreur).

Tests après B16 : 538 tests backend (+5) + 497 tests frontend (+10, net après suppression de
`matches-tab.test.tsx` remplacé par `championship-matches-panel.test.tsx`).

#### B17 — Ajustements UX supplémentaires (retour utilisateur sur B16)

- **Espacement des colonnes** : `gap-4` → `gap-6 lg:gap-10` sur les grilles à deux colonnes des
  fiches championnat et saison (B16) — la mise en page tenait déjà, il manquait juste de l'air
  entre le contenu principal et la colonne latérale.
- **Ajout de rencontres en masse** : planifier un championnat complet une rencontre à la fois
  (B13) était trop lent. Nouveau `POST .../championships/:championshipId/matches/bulk`
  (`ChampionshipMatchesService.createBulk`, même pattern que `EventsService.createBulk` du
  Calendrier, B4) — valide chaque ligne (participants distincts, appartenance au championnat)
  avant toute écriture, puis crée tout en une seule transaction Prisma (tout ou rien). Côté
  frontend, `BulkMatchFormDialog` (formulaire tableau : domicile/extérieur/date/journée par
  ligne, "Ajouter une ligne" à volonté, une seule requête pour tout créer) complète
  `MatchFormDialog` sans le remplacer, accessible depuis le même bouton d'en-tête du calendrier
  compact (B16).

Tests après B17 : 544 tests backend (+6) + 503 tests frontend (+6).

#### B18 — Nouveaux ajustements UX (retour utilisateur sur B17)

- **Lien nav "Saisons" masqué pour Coach/Player** : la fiche de saison ne contient que 2 dates
  et un statut pour un rôle en lecture seule — pas assez d'information pour justifier une entrée
  de nav dédiée (retour utilisateur explicite). `SidebarNav` masque désormais le lien dès que
  `canManage` (renvoyé par `GET /clubs/:clubId/seasons`) est `false` ou absent (403), pas
  seulement sur 403 comme avant (A20) — un Coach/Player garde malgré tout `season READ TEAM`
  côté backend, inchangé : ils continueront de voir les saisons dans les futurs filtres des
  autres pages (même principe que `SeasonFilterSelect`, A12), simplement pas via ce lien.
- **Scroll dans `BulkMatchFormDialog`** : avec beaucoup de lignes, la modale s'agrandissait hors
  écran et devenait inaccessible (retour utilisateur, suite à B17). La liste des lignes défile
  désormais dans un conteneur `max-h-[50vh] overflow-y-auto` — titre, description, "Ajouter une
  ligne" et bouton de soumission restent toujours visibles.
- **Boutons Modifier/Supprimer sur la liste des équipes** (`clubs/:clubId/teams`), absents
  jusqu'ici — seule la création existait, via un formulaire inline jamais gardé par une
  permission (bug latent : un Coach voyait un formulaire de création qui échouait
  systématiquement en 403). Nouveau `PATCH`/`DELETE /clubs/:clubId/teams/:id`
  (`TeamsService.update`/`remove`, permission `team UPDATE`/`DELETE`, réservée à AdminClub+ dans
  le seed — un Coach n'a jamais ce droit, même pour sa propre équipe). Suppression bloquée
  (409 `TEAMS.CANNOT_DELETE_NOT_EMPTY`) dès que l'équipe a au moins un membre, joueur, événement
  ou championnat — même esprit que le blocage de suppression d'une Season non-DRAFT. Frontend :
  `TeamFormDialog` (dual create/edit, remplace l'ancien formulaire inline) et `TeamRowActions`
  (menu ⋮ Modifier/Supprimer), tous deux gardés par un nouveau `canManage` renvoyé par
  `GET /clubs/:clubId/teams/mine` — dont la forme de réponse change au passage (tableau brut →
  `{data, canManage}`, alignée sur la convention déjà utilisée par tous les autres endpoints de
  liste du projet) ; `resolve-any-team.ts` et `calendar-page-content.tsx`, seuls autres
  consommateurs de cet endpoint, mis à jour en conséquence.

Tests après B18 : 552 tests backend (+8) + 507 tests frontend (+4).

#### B19 — Formulaire de création de championnat : équipe propriétaire selon le rôle

Retour utilisateur : la création d'un championnat devait automatiquement assigner la bonne
équipe propriétaire selon le rôle de l'appelant, sans étape manuelle après coup.

- **Équipe propriétaire ajoutée automatiquement comme participante** — `ChampionshipsService
  .create` crée désormais le `Championship` et son premier `ChampionshipParticipant`
  (`internalTeamId = teamId`) dans la même transaction Prisma. Il fallait auparavant cliquer sur
  "Ajouter notre équipe" (`ParticipantsTab`) juste après la création — supprimé, ce bouton ne
  s'affiche plus jamais qu'une équipe adverse reste à ajouter.
- **Sélecteur d'équipe/club selon le rôle réel** — `GET .../championships` renvoie désormais
  `createScope` (le scope brut `TEAM`/`CLUB`/`ALL`, pas seulement le booléen `canManage`) :
  Coach (`TEAM`) garde le comportement actuel (aucun sélecteur, son équipe automatiquement) ;
  AdminClub (`CLUB`) choisit parmi les équipes de son club (`GET /clubs/:clubId/teams`) ;
  SuperAdmin/Proprietaire (`ALL`) choisit d'abord un club (`GET /clubs`, limité à ceux où
  l'appelant a une fiche `Member` — limite multi-club déjà documentée), puis une équipe de ce
  club. La liste des saisons proposées se recharge avec le club sélectionné. Créer un
  championnat pour une équipe différente de la page courante redirige vers la fiche du
  championnat créé plutôt que de rafraîchir la liste affichée (qui ne le contiendrait pas).

Tests après B19 : 553 tests backend (+1, net après ajustement des tests existants touchés par
la transaction de création) + 510 tests frontend (+3).

#### B20 — Liste des championnats : colonne Équipe + vue club-wide selon le rôle

Retour utilisateur : l'AdminClub voulait voir en un coup d'œil à quelle équipe appartient chaque
championnat sur la table (au lieu d'être limité à l'équipe de la page courante) ; le
SuperAdmin/Proprietaire voulait un sélecteur de club avant cette même vue.

- **Nouveau `GET /clubs/:clubId/championships`** (`ClubChampionshipsController`) — liste tous les
  championnats du club, toutes équipes confondues, avec `team: {id, name}` inclus. `GET
  .../teams/:teamId/championships` renvoie désormais aussi `readScope` (aux côtés de
  `createScope`) : le frontend (`ChampionshipsPageContent`) pivote automatiquement vers cette vue
  club-wide (colonne Équipe) dès que `readScope` est `CLUB` ; `ALL` ajoute un sélecteur de club
  (`GET /clubs`) avant. Coach/Player (`TEAM`) gardent la vue scopée équipe, strictement
  inchangée.
- **Faille de sécurité corrigée au passage, présente depuis B16** : `SeasonChampionshipsController`
  (vue cross-équipe par saison) supposait qu'un Coach/Player ne pouvait jamais l'atteindre "car le
  frontend ne transmet jamais `?teamId=` pour cette route" — faux, `PermissionsGuard` lit
  `?teamId=` depuis la query brute indépendamment de ce que déclare le contrôleur, un Coach
  pouvait donc forcer l'URL et voir les championnats de **toutes** les équipes du club pour une
  saison donnée. Corrigé dans les deux contrôleurs (`SeasonChampionshipsController` et le nouveau
  `ClubChampionshipsController`) : le service filtre désormais explicitement sur
  `requester.teamId` dès que le scope résolu par le guard est `TEAM`, plutôt que de compter sur le
  guard seul. Voir `docs/modules/auth-roles.md` §"Patterns découverts" (quatrième cas) pour le
  détail et le pattern à réutiliser.

Tests après B20 : 560 tests backend (+7) + 512 tests frontend (+2).

#### B21 — Nav "Effectif" : variante selon le rôle

Retour utilisateur : le bouton "Effectif" de la barre de navigation menait toujours à la même
destination (roster de la dernière équipe visitée, ou liste des équipes du club si aucune),
quel que soit le rôle — pas adapté à un SuperAdmin/Proprietaire (plusieurs clubs) ni
idéalement expressif pour un AdminClub (une étape de moins serait plus clair).

- `GET /clubs/:clubId/teams/mine` renvoie désormais `readScope` (aux côtés de `canManage`,
  même pattern que `createScope`/`readScope` sur les championnats, B19/B20) — le scope brut
  derrière la logique déjà existante "club-wide ou pas" de `TeamsService.findMineInClub`.
- `SidebarNav` adapte le bouton "Effectif" en conséquence, jamais déduit d'un rôle côté client :
  - **SuperAdmin/Proprietaire** (`readScope: 'ALL'`) : bouton **"Club"** → `/home` (liste des
    clubs de l'appelant) → choix d'un club → tableau de ses équipes → effectif.
  - **AdminClub** (`readScope: 'CLUB'`) : bouton **"Équipes"** → tableau des équipes du club →
    effectif.
  - **Coach/Player** (`readScope: null` — un scope TEAM ne matche structurellement jamais ce
    `can()` sans `teamId` dans le contexte, voir `TeamsService.findMineInClub`) : bouton
    **"Effectif"** inchangé, directement vers sa propre équipe (`data[0]`) — il n'a pas besoin
    de voir les autres effectifs.

Tests après B21 : 560 tests backend (+0, champ ajouté à un test existant) + 515 tests frontend
(+3).

---

## Correctif transverse — Rôles plateforme (SuperAdmin/Proprietaire multi-club) ✅

_2026-07-15_

Correction d'une hypothèse erronée portée depuis le début du module Championship : `SuperAdmin`/
`Proprietaire` ne sont pas des rôles rattachés à un club (même via le scope global `MemberRole
.clubId = null`, qui exigeait quand même une fiche `Member` par club accédé — limitation
documentée dans `docs/modules/auth-roles.md` depuis B16/B20, jusqu'ici acceptée comme une
contrainte définitive). Ce sont des rôles **plateforme** : le personnel de FootManager, sans
rattachement à un club particulier, avec accès complet à tous les clubs pour aider AdminClub/
Entraîneurs. Correctif transverse (auth/permissions), sans lien avec le module Championship —
sorti de la numérotation `B` pour cette raison, branche dédiée `feature/roles-plateforme`.

Révèle au passage une élévation de privilège : `ClubsService.create` accordait jusqu'ici
`Proprietaire` à quiconque créait un club — correct sous l'ancienne lecture ("propriétaire de ce
club"), plus du tout sous la nouvelle ("propriétaire de la plateforme").

| Livrable | Contenu |
|---|---|
| Schéma | `model UserRole` (`User` ↔ `Role`, sans `Member`/`Club`), `MemberRole.clubId = null` documenté legacy |
| `PermissionsService` | `canAsUser`, `hasActivePlatformRole`, `canEffective` (union Member local + rôle plateforme) |
| `PermissionsGuard` | repli sur `canEffective` + provisioning différé du `Member` (après succès de l'autorisation uniquement) |
| `MembersService` | `resolveOrProvisionMember`, repris par les 7 points d'appel qui contournaient déjà le guard |
| `ClubsService` | `create` accorde `AdminClub` (plus `Proprietaire`) ; `findAllForUser` étendu aux titulaires d'un rôle plateforme |
| Bootstrap | `backend/scripts/bootstrap-platform-role.ts` — seul moyen d'attribuer un rôle plateforme (pas d'UI self-service en MVP) |
| Tests | `platform-role-multi-role.integration.spec.ts` + mise à jour mécanique de 22 fixtures existantes |
| Docs | `docs/modules/auth-roles.md`, `docs/schema/fondations.md`, `CLAUDE.md` |

**Point reporté** : grant/revoke de `UserRole` en libre-service par un `Proprietaire` existant
(UI/API) — Phase 9, "Gestion des rôles personnalisés". Le transfert sécurisé du rôle `Proprietaire`
entre deux titulaires (succession) reste également à concevoir (Phase 9).

Tests après ce correctif : 582 tests backend (+22 par rapport à la fin de B21) + 515 tests
frontend (inchangé, aucune modification frontend).

---

## Correctif transverse — Liaison Parent↔Enfant (décision ouverte #5) ✅

_2026-07-15_

Décision produit tranchée avec l'utilisateur : un mineur ne pouvant pas se connecter, son Parent
agit à sa place sur son enfant précis (jamais sur le reste de l'équipe) — consultation, édition
des informations personnelles (hors football), déclaration d'absence à venir. Correctif
transverse (auth/permissions), backend uniquement — le câblage frontend (UI de liaison, vue "mes
enfants") est un incrément séparé à faire ensuite, branche dédiée `feature/auth-parent-enfant`.

| Livrable | Contenu |
|---|---|
| Schéma | `model ParentChild` (`Member` parent ↔ `Member` enfant), enum `PermissionScope` + `PARENT` |
| Module | `backend/src/parent-child/` — `POST`/`GET`/`DELETE .../players/:playerId/parents` (staff uniquement), `GET .../parent-child/mine` (self-service Parent) |
| Services étendus | `players`, `player-measurements`, `player-evaluations`, `player-interviews`, `player-notes` (PUBLIC uniquement), `player-objectives` (PUBLIC uniquement), `player-absences` (lecture + création, `isExcused` forcé `null`), `members` (édition informations personnelles) |
| Helper | `assertParentChildLink` (`backend/src/common/parent-child-membership.ts`), calqué sur `assertPlayerInTeam` |
| Piège corrigé en conception | cumul Player+Parent sur le même contexte club/équipe : la branche `PARENT` de chaque service reste un sur-ensemble strict d'`OWN` (vérifie toujours "est-ce moi ?" avant d'exiger le lien) |
| Complément | `UpdateMyMemberDto` élargi (`firstName`/`lastName`/`phone`, plus seulement `birthDate`) — un membre auto-provisionné (nom placeholder dérivé de l'email) peut désormais corriger son identité en self-service |
| Tests | `parent-child-multi-role.integration.spec.ts`, `parent-child.service.spec.ts` + mises à jour `members.service.spec.ts` |
| Docs | `docs/modules/auth-roles.md` (nouveau §Rôle Parent), `docs/schema/fondations.md`, `docs/decisions-ouvertes-et-rgpd.md`, `docs/schema/joueurs.md`, `docs/modules/effectif-joueurs.md`, `docs/modules/calendrier-evenements.md` |

**Hors scope** : confirmation de convocation Match/Entraînement (`docs/modules/matchs.md`,
`docs/modules/entrainement.md`) — Phases 4/5, pas encore construites, le mécanisme sera réutilisé
une fois ces modules livrés. Notifications au Parent : décision ouverte #2, inchangée.

Tests après ce correctif : 601 tests backend (+19) + 515 tests frontend (inchangé, aucune
modification frontend).

---

## Phase 4 — Matchs (notre équipe) 🚧

_~3 semaines_

Découpage établi le 2026-07-16, sur le modèle des Phases 2/3 (Parties lettrées, incréments
granulaires). **Écart avec les Phases 2/3** : une seule branche `feature/module-matchs` pour
l'ensemble des Parties A-D (décision explicite, 2026-07-16) plutôt qu'une branche par Partie —
mergée dans `develop` une fois la Phase 4 entière terminée et testée. Décisions actées avant le
premier incrément (voir `docs/modules/matchs.md`) :
- `MatchType` à 4 valeurs : `CHAMPIONNAT`/`COUPE`/`AMICAL`/`TOURNOI`.
- `Coupe` : pas de nouvelle entité de compétition — un simple champ `cupRound` sur `Match`,
  adversaire via `ExternalTeam` (liste existante ou création à la volée), pas de bracket.
- Un match de championnat ne se crée **que** depuis le module Championnat (qui alimente le
  Calendrier automatiquement, en transaction) — le Calendrier ne permet de créer directement que
  Amical/Coupe/Tournoi.
- Statistiques : liste de matchs filtrable (type/saison/championnat(s)) + tableau de stats par
  joueur en Phase 4 ; le Dashboard visuel complet reste Phase 6.
- Correctif de schéma au passage : `ChampionshipMatch.matchId` (posé sans `@relation` en Phase 3)
  est retiré comme colonne physique au profit d'une relation inverse Prisma sur
  `Match.championshipMatchId`, seule FK réelle — évite une double source de vérité pour une
  relation 1–1 (`docs/schema/index.md` §Zéro duplicata).
- **Hors scope explicite** : signalement visuel des joueurs blessés en composition (dépend
  d'`Injury`, Phase 8) ; Dashboard visuel complet (Phase 6) ; notifications de convocation
  (décision ouverte #2).

### Partie A — Fondations `Match` & liaison Calendrier/Championnat

| Étape | Contenu |
|---|---|
| A0 | Prérequis : permissions granulaires par sous-ressource (`match`, `match_lineup`, `match_period`, `match_event`, `match_attendance`, `match_player_rating`) au seed — voir `docs/modules/matchs.md` §Droits par rôle ✅ |
| A1 | Schéma `Match` (+ `MatchType` 4 valeurs, `CupRound`, `HomeOrAway`, `LiveMatchStatus`), correction `ChampionshipMatch.matchId`, migration ✅ |
| A2 | Backend `matches` CRUD scopé équipe (`clubs/:clubId/teams/:teamId/matches`) — création directe limitée à Amical/Coupe/Tournoi, crée Event+Match en transaction ✅ |
| A3 | Backend — auto-création `Event`+`Match` transactionnelle depuis `ChampionshipMatch` (création simple et en masse), uniquement si notre équipe est participante ✅ |
| A4 | Frontend — `EventFormDialog` : sous-formulaire match (type, adversaire existant/nouveau, `cupRound` si Coupe) ✅ |
| A5 | Frontend — affichage des matchs de championnat dans le Calendrier ✅ |
| A6 | Tests multi-rôles bout-en-bout Partie A ✅ |

Scénario multi-rôles bout-en-bout (A6, docs/modules/auth-roles.md §"Multi-rôles — règle de test
obligatoire") : `backend/src/common/matchs-fondations-multi-role.integration.spec.ts` — même
persona Marc (Coach équipe 5/Player équipe 8/Parent Club 2 équipe 12). Marc-Coach crée un match
Amical et un match Coupe (avec `cupRound`) directement via `MatchesService`, puis planifie une
rencontre de championnat impliquant son équipe et vérifie la liaison automatique Event+Match
(A3) — `matchType CHAMPIONNAT`, `homeOrAway` dérivé, titre = nom de l'adversaire sans texte en
dur ; refusé en écriture sur l'équipe 8 où il n'est que Player. Marc-Player lit les matchs de sa
propre équipe en lecture seule (`canManage=false`), écriture refusée par le guard. Marc-Parent
lit (scope `PARENT`) les matchs de l'équipe de son enfant, écriture refusée.

**Clôture Partie A** : schéma `Match` posé, liaison bidirectionnelle Calendrier ↔ Championnat
opérationnelle (création directe Amical/Coupe/Tournoi ; auto-création depuis un `ChampionshipMatch`
pour les matchs de championnat), garde-fous d'intégrité (édition/suppression d'un événement lié à
un match bloquées côté frontend et backend). Tests à la fin de la Partie A : 699 tests backend +
554 tests frontend.

### Partie B — Préparation & convocations

| Étape | Contenu |
|---|---|
| B0 | Schéma `MatchAttendance`, `MatchLineup` (+ enums `ConvocationStatus`, `AttendanceStatus`, `LineupStatus`) ✅ |
| B1 | Backend convocations : CRUD `MatchAttendance` (`clubs/:clubId/teams/:teamId/matches/:matchId/attendances`), convocation en masse idempotente, réponse Player (`OWN`)/Parent (`PARENT`) restreinte à `convocationStatus` ✅ |
| B2 | Backend composition : CRUD `MatchLineup` (`clubs/:clubId/teams/:teamId/matches/:matchId/lineups`), upsert en masse (Coach/SuperAdmin ; AdminClub/Player lecture seule, Parent aucun accès) ✅ |
| B3 | Frontend fiche match (nouvelle route `.../matches/:matchId`, en-tête + onglets) — onglet Convocations ✅ |
| B4 | Frontend fiche match — onglet Composition |
| B5 | Tests multi-rôles Partie B |

### Partie C — Live & clôture

| Étape | Contenu |
|---|---|
| C0 | Schéma `MatchPeriod`, `MatchEvent` |
| C1 | Backend gestion des périodes (timestamps serveur) |
| C2 | Backend `MatchEvent` CRUD (buts/passes, cartons, remplacements, pénos) |
| C3 | Backend clôture — calcul du score, écriture sur `ChampionshipMatch` ou `Match` selon le type |
| C4 | Frontend interface live |
| C5 | Correction post-match (score/événement après clôture) |
| C6 | Tests multi-rôles Partie C |

### Partie D — Après-match & statistiques

| Étape | Contenu |
|---|---|
| D0 | Schéma `MatchPlayerRating` |
| D1 | Backend présences effectives |
| D2 | Backend évaluation collective + individuelle |
| D3 | Frontend onglets Présences effectives + Évaluations |
| D4 | Backend — filtres statistiques (type de match, saison, championnat(s)) |
| D5 | Frontend — page "Historique des matchs" filtrable + tableau de stats par joueur |
| D6 | Tests multi-rôles Partie D + clôture Phase 4 + revue de cohérence doc↔code |

---

## Phase 5 — Entraînement & Exercices ⬜

_~4 semaines_

- `TrainingSession`, `Exercise`, `TrainingSessionExercise`, `TrainingAttendance`,
  `TrainingFeedback`.
- Bibliothèque d'exercices + éditeur graphique (placement de joueurs, tracé de flèches).
- Évaluation globale de séance + évaluation joueurs liée à la séance.
- Feedback joueur avec fenêtre d'édition définie par l'entraîneur.
- Alimente le futur Dashboard joueur (Phase 6) et potentiellement `PlayerAbsence`.

---

## Phase 6 — Dashboard joueur ⬜

_Quelques jours — phase réduite par la décision du 2026-07-06 (voir Partie A/A7 en Phase 2) :
`PlayerMeasurement`, `PlayerEvaluation`, `PlayerObjective`, `PlayerInterview` et le modèle de
visibilité sont déjà livrés._

- Agrégation des stats Matchs (Phase 4) + Entraînement (Phase 5) : participations,
  titularisations, buts, passes décisives, clean sheets, cartons, dernières évaluations,
  objectifs en cours.
- Ne peut pas commencer avant que les Phases 4 et 5 existent.
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

- Gestion des rôles personnalisés (interface de création + attribution de permissions) — devrait
  aussi couvrir l'attribution/révocation self-service d'un rôle plateforme (`UserRole`) par un
  Propriétaire existant, aujourd'hui limitée au script `bootstrap-platform-role.ts`.
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
- Vue agrégée cross-club pour un Propriétaire/SuperAdmin (dashboard multi-clubs) — le mécanisme
  d'accès sans rattachement club (`UserRole`) est livré (correctif transverse post-Phase 3), il
  ne reste qu'une vue de consultation agrégée à concevoir.
- Extension à d'autres sports.
