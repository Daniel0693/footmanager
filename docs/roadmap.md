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

_~2–3 semaines_

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
| Frontend liste effectif | ✅ | Table + filtres par ligne/poste, navigation club → équipe → effectif |
| Frontend fiche joueur (onglets) | ⬜ | Reste à faire : shell 7 onglets (1 seul actif : Infos), formulaire ajout/édition |
| Tests multi-rôles bout-en-bout | ⬜ | Scénario complet + revue de cohérence doc ↔ code |

Tests automatisés : 73 tests backend (Jest/NestJS) + 26 tests frontend (Jest/React Testing
Library, mis en place pendant cette phase — voir `docs/architecture.md` §6). Plusieurs bugs
réels ont été trouvés et corrigés en testant manuellement avec les 6 rôles (voir
`docs/modules/auth-roles.md` §Patterns découverts).

### Partie B — Module Calendrier

Non commencée.

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

---

## Phase 5 — Entraînement & Exercices ⬜

_~4 semaines_

- `TrainingSession`, `Exercise`, `TrainingSessionExercise`, `TrainingAttendance`,
  `TrainingFeedback`.
- Bibliothèque d'exercices + éditeur graphique (placement de joueurs, tracé de flèches).
- Évaluation globale de séance + évaluation joueurs liée à la séance.
- Feedback joueur avec fenêtre d'édition définie par l'entraîneur.

---

## Phase 6 — Profil joueur complet ⬜

_~2–3 semaines_

- `PlayerMeasurement`, `PlayerEvaluation` (radar 6 catégories), `PlayerObjective`,
  `PlayerInterview`, `PlayerAbsence`.
- Dashboard joueur : agrégation des stats Matchs + Entraînement.
- Modèle de visibilité Privé/Semi-privé/Public opérationnel.
- Statistiques filtrables par Season ou Championship.

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
