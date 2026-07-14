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

## Phase 2 — Effectif & Calendrier 🚧

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

## Phase 3 — Saisons & Championnats 🚧

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
| A18 | Frontend : sélecteur "Joueur existant du club" dans `PlayerFormDialog` (recherche affichée **par défaut**, avant "Nouveau joueur" — retour utilisateur), pour les promotions/transferts entre équipes (ex. U15→U16) sans recréer le profil |
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

### Partie B — Module Championship 🚧

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
| B15 | Tests multi-rôles bout-en-bout Partie B + clôture |

Démarre sur une branche `feature/saisons-module-championship` séparée, une fois la Partie A
mergée dans `develop`.

**Points reportés (à ne pas oublier)** :
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
- Alimente le futur Dashboard joueur (Phase 6) et potentiellement `PlayerAbsence`.

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
