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
| **A7 — Profil joueur enrichi** | 🚧 | **Décision du 2026-07-06** : contenu réel des onglets, un par un (voir sous-étapes ci-dessous), plutôt que de tout renvoyer en Phase 6 |
| A8 — Tests multi-rôles bout-en-bout | ⬜ | Scénario complet + revue de cohérence doc ↔ code (anciennement dernière étape de la Partie A, renumérotée après l'ajout de A7) |

#### Sous-étapes A7 — une entité à la fois

| Sous-étape | Statut | Entité | Contenu |
|---|---|---|---|
| A7.1 — Mesures | ✅ | `PlayerMeasurement` | Backend (schéma/migration, CRUD READ/CREATE/DELETE — pas d'UPDATE, historique append-only —, filtres/tri via query params `type`/`dateFrom`/`dateTo`/`sortBy`/`sortOrder`, permissions, 17 tests) + onglet frontend (graphique unique 2 courbes avec légende cliquable, filtres du graphique et du tableau **partagés** — un seul jeu d'état pilote les deux —, tri de colonnes propre au tableau, ligne d'ajout compacte, suppression en rouge — tout le filtrage/tri résolu côté backend, décision du 2026-07-06, 12 tests) |
| A7.2 — Entretien | ✅ | `PlayerInterview` | Backend (schéma/migration, CRUD READ/CREATE/UPDATE/DELETE, `staffId` auto-assigné au membre appelant, filtres/tri via query params `dateFrom`/`dateTo`/`sortOrder`, permissions, 27 tests + smoke test Docker multi-rôles) + onglet frontend en **timeline** (carte par entretien, badge "Planifié" pour les entretiens à venir, dialogue unique réutilisé pour créer/éditer, suppression directe, 19 tests). Peut être **planifié à l'avance** (date/sujet/résumé seuls requis) puis complété après coup (décision du 2026-07-06) : `staffFeedback`/`staffAssessment`/`playerFeedback` sont tous optionnels. Visibilité par champ pour le Player : ne voit jamais `staffAssessment` (ressenti interne, même tension RGPD Article 15 que les notes `PRIVE`) ni les entretiens futurs — voir `docs/modules/effectif-joueurs.md` §Entretien |
| A7.3 — Notes | ✅ | `PlayerNote` | Backend (schéma/migration, CRUD READ/CREATE/UPDATE/DELETE, `authorId` auto-assigné, tri via `sortOrder`, permissions, 41 tests + smoke test Docker multi-rôles) + onglet frontend en timeline (badge de visibilité, dialogue unique créer/éditer, suppression directe, 14 tests). Introduit le modèle de visibilité Privé/Semi-privé/Public : un Player ne reçoit jamais les notes `PRIVE` (même tension RGPD Article 15 que `PlayerInterview.staffAssessment`) ; le rôle Parent n'est pas câblé sur cette visibilité (pas de liaison Parent↔Joueur). Première ressource à appliquer `assertPlayerInTeam` dès sa conception (voir correctif de sécurité ci-dessous) |
| A7.4 — Objectifs | ⬜ | `PlayerObjective` | Idem + réutilise le modèle de visibilité construit en A7.3 ; 4 statuts (`PLANNED`/`IN_PROGRESS`/`ACHIEVED`/`FAILED`), défaut `SEMI_PRIVE` |
| A7.5 — Évaluation | ⬜ | `PlayerEvaluation` | Idem + radar dynamique (N axes selon `ClubEvaluationConfig` du club, voir `docs/schema/joueurs.md`) ; `EvaluationCategory`/`EvaluationCriterion` déjà seedés depuis la Phase 1 |

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
A7.3 (Notes) : 178 tests backend + 92 tests frontend au total.
Plusieurs bugs réels ont été trouvés et corrigés en testant manuellement avec les 6
rôles (voir `docs/modules/auth-roles.md` §Patterns
découverts).

**Correctif de sécurité (avant A7.3)** : un Coach pouvait agir sur les mesures/entretiens/profils
de n'importe quel joueur du club en transmettant sa propre équipe en `?teamId=` — ni
`PlayersService`, ni `PlayerMeasurementsService`, ni `PlayerInterviewsService` ne vérifiaient que
le joueur ciblé appartient réellement à cette équipe (seulement au club). Corrigé via
`assertPlayerInTeam` avant de démarrer A7.3, avec tests de régression dédiés. 153 tests backend
au total après correctif. Voir `docs/modules/auth-roles.md` §Patterns découverts.

### Partie B — Module Calendrier

Non commencée. À la conception, statuer sur l'emplacement de `PlayerAbsence` (voir note A7
ci-dessus).

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
