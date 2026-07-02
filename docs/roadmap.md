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

---

## Phase 2 — Effectif & Calendrier ⬜
*~2–3 semaines*

- `PlayerProfile`, `PlayerTeam`, `TeamStaff`, `ExternalTeam`.
- Module Effectif : ajout/édition/suppression joueurs, liste de l'effectif, profil de base.
- Module Calendrier : création d'événements (`Event`), code couleur par type / par équipe.
- Saisie des présences sur un événement.
- Convocations (email, si le temps le permet, sinon reporté en Phase 9).

---

## Phase 3 — Saisons & Championnats ⬜
*~2–3 semaines*

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
*~3 semaines*

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
*~4 semaines*

- `TrainingSession`, `Exercise`, `TrainingSessionExercise`, `TrainingAttendance`,
  `TrainingFeedback`.
- Bibliothèque d'exercices + éditeur graphique (placement de joueurs, tracé de flèches).
- Évaluation globale de séance + évaluation joueurs liée à la séance.
- Feedback joueur avec fenêtre d'édition définie par l'entraîneur.

---

## Phase 6 — Profil joueur complet ⬜
*~2–3 semaines*

- `PlayerMeasurement`, `PlayerEvaluation` (radar 6 catégories), `PlayerObjective`,
  `PlayerInterview`, `PlayerAbsence`.
- Dashboard joueur : agrégation des stats Matchs + Entraînement.
- Modèle de visibilité Privé/Semi-privé/Public opérationnel.
- Statistiques filtrables par Season ou Championship.

---

## Phase 7 — Scouting ⬜
*~3 semaines*

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
*~2 semaines*

- `Injury`, `InjuryAssignment`, `InjuryRehabEvent`.
- Timeline de rééducation, intervenants multiples.
- Statut blessé/rétabli intégré à l'effectif et aux convocations.
- Historique et statistiques de récidive.

---

## Phase 9 — Finitions MVP & tests ⬜
*~2 semaines*

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
