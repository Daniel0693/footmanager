# CLAUDE.md — FootManager

> Ce fichier est lu automatiquement par Claude Code au début de chaque session.
> Il doit rester court (~150 lignes) et ne contenir que ce qui change le comportement de Claude.
> Le détail complet vit dans `docs/` — ce fichier n'en est que l'index + les règles non négociables.

## Le projet en une phrase

FootManager : plateforme web tout-en-un pour **tous les acteurs d'un club sportif** —
entraîneurs, joueurs, parents, responsables de club, staff médical, trésorerie, etc. Objectif :
devenir la référence unique pour toute question organisationnelle ou de suivi au sein d'un club.

**Sport cible du MVP : football.** L'architecture est conçue pour accueillir d'autres sports
collectifs (basket, rugby, handball...) sans refonte — par ajout progressif de contenu
(positions, événements de match, critères d'évaluation) basé sur de vrais retours utilisateurs.
Ne pas anticiper plusieurs sports dans le code du MVP : l'architecture le permet déjà,
l'implémentation attendra une demande réelle. Phase actuelle : MVP football.

## Stack technique

- **Front-end** : React + Next.js, TypeScript
- **Back-end** : NestJS (TypeScript), architecture modulaire (un module Nest par domaine métier)
- **ORM** : Prisma
- **Base de données** : PostgreSQL
- **Auth** : JWT (access token + refresh token), refresh token en cookie httpOnly, silent refresh
- **Internationalisation** : i18n dès le départ (voir ci-dessous)
- **Déploiement** : Docker / docker-compose (services backend, db, frontend)

Détail et justification des choix : voir `docs/architecture.md`.

## Internationalisation (i18n) — non négociable

L'application est conçue multi-langue dès le départ. **Aucun texte visible dans l'UI ne doit être
codé en dur** : toutes les chaînes passent par le système i18n. Langues cibles futures : anglais,
allemand, portugais, italien, espagnol (et d'autres). Langue par défaut du MVP : français.
Voir `docs/architecture.md` §3 pour les conventions et la bibliothèque retenue.

## Langue du code

Le code (variables, fonctions, commentaires techniques) reste en **anglais**. Les clés de
traduction (i18n) sont en anglais. Les données de démo/seed peuvent être en français.

## Règle d'or — Permissions (NE JAMAIS ENFREINDRE)

**La logique de permission doit TOUJOURS être évaluée via le système de rôles scopé** — rôle par
rôle, pour le club et/ou l'équipe concernés. Ne jamais introduire de raccourci du type
`if (user.role === 'SuperAdmin') return true` qui contourne le scope club/équipe.

Un utilisateur peut cumuler plusieurs rôles **simultanément dans des contextes distincts** (ex.
Coach dans l'équipe U15, Player dans l'équipe seniors, Parent dans l'équipe U10 — trois scopes,
trois jeux de droits). Toute implémentation de permission doit couvrir ce cas, pas seulement le
cas d'un rôle unique. **Chaque modification touchant aux droits doit être testée avec au moins
un scénario multi-rôles.**

Voir `docs/modules/auth-roles.md` pour le détail, les cas limites et le système de rôles dynamiques.

## Rôles

Rôles fixes intégrés au système (non supprimables) :
`Player`, `Parent`, `Coach` (principal / co-entraîneur / adjoint via `TeamStaff`),
`AdminClub`, `SuperAdmin`, **`Proprietaire`** (au-dessus de SuperAdmin, mécanisme de transfert
sécurisé pour la succession — à implémenter dès le MVP).

Rôles personnalisés (créés via l'interface par un AdminClub ou SuperAdmin) : système de rôles
dynamiques avec permissions granulaires configurables. Exemple : `Physiotherapeute` avec accès
en lecture/écriture aux données médicales des joueurs de ses équipes, sans accès au reste.
Voir `docs/modules/auth-roles.md` §Rôles dynamiques.

## RGPD

Contrainte de conception dès maintenant ; implémentation complète différée à la phase de
développement réel. **Avant toute fonctionnalité touchant aux notes privées, à l'export de
données personnelles, à la suppression de compte ou aux données de mineurs**, relire
`docs/decisions-ouvertes-et-rgpd.md`.

## Structure de la documentation (`docs/`)

| Fichier                                 | Contenu                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `docs/architecture.md`                  | Stack, i18n, structure de repo, Docker, UX/UI, vision produit                                         |
| `docs/schema/index.md`                  | **Point d'entrée du schéma BDD** — conventions, enums globaux, table de correspondance entité→fichier |
| `docs/schema/fondations.md`             | User, Club, Team, Member, rôles, permissions                                                          |
| `docs/schema/joueurs.md`                | PlayerProfile, évaluations, notes, objectifs, absences                                                |
| `docs/schema/evenements.md`             | Event, TrainingSession, Match, gestion live                                                           |
| `docs/schema/championnats.md`           | Season, Championship, ExternalTeam/Player                                                             |
| `docs/schema/scouting.md`               | TeamScoutingReport, PlayerScoutingReport, critères                                                    |
| `docs/schema/medical.md`                | Injury, rééducation — données de santé RGPD                                                           |
| `docs/modules/auth-roles.md`            | RBAC, JWT, rôles fixes et dynamiques, permissions, multi-rôles                                        |
| `docs/modules/effectif-joueurs.md`      | Profils joueurs, mesures, évaluations, objectifs, notes, entretiens                                   |
| `docs/modules/calendrier-evenements.md` | Calendrier, événements, code couleur, filtres                                                         |
| `docs/modules/entrainement.md`          | Séances, exercices, présence, feedback, éditeur graphique                                             |
| `docs/modules/saisons-championnats.md`  | Saisons, championnats, classement, ExternalTeam, live match format                                    |
| `docs/modules/matchs.md`                | Feuille de match, gestion live, périodes, événements, statistiques                                    |
| `docs/modules/scouting.md`              | TeamScoutingReport, PlayerScoutingReport, ExternalPlayer/Team, recrutement                            |
| `docs/modules/blessures.md`             | Suivi médical, rééducation, statut de disponibilité                                                   |
| `docs/decisions-ouvertes-et-rgpd.md`    | Décisions en attente + contraintes RGPD                                                               |
| `docs/roadmap.md`                       | Plan de développement par phases et état d'avancement                                                 |

## Règle de cohérence

**Avant toute modification structurelle** (schéma BDD, permissions, nouvelle entité, nouveau
module) : relire le(s) fichier(s) `docs/` et `docs/schema/` concerné(s).
**Après toute décision changeant l'architecture ou le schéma** : mettre à jour le fichier `docs/`
correspondant dans le même commit. Si un changement rend une partie de `docs/` obsolète sans
qu'elle soit mise à jour, le signaler explicitement plutôt que de laisser l'incohérence s'installer.

## Conventions de notation

Partout dans l'application, la notation est **sur 10** (stockée en base comme un `Decimal(4,1)`
permettant des demi-points : 0.0, 0.5, 1.0, ... 10.0). L'UI affiche cette note sous forme
d'**étoiles sur 5** (valeur / 2, avec demi-étoiles). Jamais d'autre échelle.

## Commandes (à compléter après la Phase 1)

```bash
cd backend && npm run start:dev
cd backend && npx prisma migrate dev
cd backend && npm run test

cd frontend && npm run dev

docker-compose up
```

## Convention Git — branches et commits

### Branches principales

```
main       → production, toujours stable et déployable
develop    → intégration, branche de référence du développement
```

### Branches de travail

```
feature/[module]-[description]    → nouvelle fonctionnalité
fix/[module]-[description]        → correction de bug
refactor/[module]-[description]   → refactoring sans changement de comportement
docs/[description]                → documentation uniquement
chore/[description]               → config, dépendances, outils
```

Exemples :

```
feature/effectif-liste-joueurs
feature/calendrier-vue-mensuelle
feature/matchs-live-periodes
fix/permissions-coach-scope-equipe
docs/schema-evaluation-category
```

### Flux de travail obligatoire

1. Toujours partir de `develop` pour créer une branche de travail.
2. Ne jamais committer directement sur `main` ou `develop`.
3. Une branche = une fonctionnalité cohérente (pas plusieurs modules mélangés).
4. Merger dans `develop` une fois la fonctionnalité terminée et testée.
5. `main` ne reçoit que des merges depuis `develop` quand une phase est complète et stable.

### Convention de commits

Format : `[module] type: description courte`

Types : `feat`, `fix`, `refactor`, `test`, `chore`, `docs`

```
[effectif] feat: ajout liste joueurs avec filtres par poste
[effectif] feat: fiche joueur onglet mesures
[calendrier] feat: vue mensuelle avec code couleur par type
[auth] fix: correction scope équipe pour coach adjoint
[schema] chore: migration PlayerTeam avec joinDate/leaveDate
[docs] docs: mise à jour schema/joueurs.md après migration
```

Jamais : `wip`, `fix`, `update`, `changes`, `misc`.

### Règles que Claude Code doit suivre automatiquement

- **Avant de commencer une tâche** : vérifier la branche courante.
  Si sur `main` ou `develop` → créer la bonne branche `feature/` avant tout.
- **Après chaque incrément logique fonctionnel** : proposer un commit avec un
  message respectant la convention ci-dessus. Ne pas accumuler plusieurs
  fonctionnalités dans un seul commit.
- **Si un changement touche le schéma Prisma** : le commit doit inclure à la fois
  la migration ET la mise à jour du fichier `docs/schema/` concerné.
- **Si un changement touche les permissions** : le commit doit inclure les tests
  de permission correspondants (pas de permission sans test).
- **Ne jamais forcer un push (`--force`)** sans validation explicite.
- **En fin de session** : signaler sur quelle branche le travail a été laissé
  et ce qui reste à faire avant le merge dans `develop`.
