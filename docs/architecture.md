# Architecture — FootManager

## 1. Vision produit

FootManager est une **plateforme web pour tous les acteurs d'un club de football** — pas
uniquement les entraîneurs. Elle sert :

- Les **entraîneurs et staff technique** : planification de séances, exercices, évaluations
  joueurs, suivi de match.
- Les **responsables de club** (AdminClub, Propriétaire) : gestion de l'effectif, assignation
  aux équipes, suivi multi-équipes, organisation générale, finances (à terme).
- Les **joueurs** : accès à leur profil, calendrier, feedback post-séance, objectifs, convocations.
- Les **parents** : suivi de leur enfant, convocations, confirmation de présence, et à terme des
  fonctionnalités comme l'organisation de covoiturage.
- Le **staff médical et paramédical** (kinés, médecins, préparateurs physiques — via des rôles
  personnalisés) : suivi des blessures et rééducation.
- La **trésorerie / gestion administrative** (à terme, via rôles personnalisés) : cotisations,
  licences, comptabilité.

**Objectif à terme** : devenir la référence unique pour toute question organisationnelle au sein
d'un club amateur — que le travail soit facilité pour chaque acteur, chacun ayant accès
exactement à ce dont il a besoin et rien de plus.

### Positionnement par rapport aux solutions existantes (contexte)

- **SportEasy** : fort sur calendrier/convocations/présence/communication, sans contenu de
  coaching. → On reprend la simplicité de la gestion d'équipe, on ajoute le contenu d'entraînement.
- **Coach-Adjoint** : focalisé sur les statistiques agrégées de saison. → Bilan automatique à
  partir des données saisies (notes, présences, résultats).
- **Touchtight** : très complet (planificateur de séance multimédia, bibliothèque partagée),
  complexe et payant. → Limite haute de fonctionnalités pour le MVP.
- **Smart Football Coach++** : la solution la plus proche de la vision FootManager (gestion +
  exercices + stats + présence), mais mobile/tablette uniquement. → FootManager vise la même
  intégration verticale, en version web multi-supports, étendue à tous les acteurs du club.

## 2. Stack technique

### Front-end — React + Next.js

SSR/SPA selon les besoins de page. Réutilisation de logique facilitée si une version mobile
(React Native) est envisagée plus tard.

Bibliothèques à prévoir :
- Librairie de calendrier (FullCalendar ou similaire) pour la vue agenda.
- Librairie canvas/SVG (Konva.js ou similaire) pour l'éditeur graphique d'exercices.
- Bibliothèque i18n (voir §3).

Design : responsive mobile-first (usage terrain par les coachs), PWA envisagée pour un cache
local minimal en cas de mauvaise connexion sur le terrain.

### Back-end — NestJS (TypeScript)

Structure modulaire : un module Nest par domaine métier. Injection de dépendances, organisation
claire, bonne compatibilité Docker.

Auth : JWT (access token de courte durée + refresh token en cookie httpOnly, silent refresh).

WebSockets : non prioritaire pour le MVP (envisageable plus tard : mise à jour temps réel des
présences, messagerie).

### Base de données — PostgreSQL + Prisma

PostgreSQL pour l'intégrité référentielle sur des données fortement relationnelles (joueurs ↔
équipes ↔ événements ↔ notes ↔ évaluations). Prisma comme ORM pour la cohérence de types
TypeScript de bout en bout et la gestion des migrations. Schéma complet : `docs/schema-bdd.md`.

**Principes de conception de la BDD** (non négociables) :
- Flexibilité pour l'ajout de fonctionnalités futures sans refonte structurelle.
- Zéro duplicata : toute valeur stockée a une seule source de vérité ; les données dérivées
  sont calculées à la volée ou matérialisées explicitement si la performance l'exige.
- Respect des formes normales relationnelles (3NF minimum).
- Champs optionnels anticipés pour les évolutions futures plutôt que colonnes ajoutées en urgence.

### Déploiement — Docker

Services `docker-compose` :
- `backend` : NestJS/Node
- `db` : PostgreSQL
- `frontend` : Next.js (ou build statique Nginx)
- (futur) service de stockage de fichiers pour médias/exports

## 3. Internationalisation (i18n)

**L'application est multi-langue dès la première ligne de code.** Aucun texte visible dans l'UI
ne doit être codé en dur — toutes les chaînes passent par le système i18n.

Langues cibles : français (MVP), puis anglais, allemand, portugais, italien, espagnol et d'autres.

### Convention

- **Clés de traduction** : en anglais (`training.session.title`, `player.profile.position`...).
- **Bibliothèque côté front** : `next-intl` (recommandée pour Next.js, SSR inclus) ou `i18next`
  avec `react-i18next` si on préfère rester indépendant du framework.
- **Fichiers de traduction** : `locales/fr.json`, `locales/en.json`, etc. Un fichier par langue,
  organisé hiérarchiquement par module.
- **Côté back** : les messages d'erreur retournés à l'UI sont des codes (pas du texte brut), la
  traduction est entièrement gérée côté front. Les emails/notifications passent par des templates
  localisés.
- **Données** : les données métier (noms de joueurs, descriptions d'exercices...) sont stockées
  telles quelles en BDD ; la traduction ne s'applique qu'à l'interface et aux libellés système
  (enums, statuts, types d'événements...).

## 4. Structure de repo (mise à jour Phase 1)

```
backend/
  src/
    auth/           # JWT access+refresh, strategies Passport, guards
    users/
    clubs/
    teams/
    members/
    roles/          # RolesService + PermissionsService.can() (règle d'or)
    prisma/
      prisma.module.ts
      prisma.service.ts
    common/
      exceptions/   # AppException — réponses d'erreur en codes, jamais en texte
    # events/, training/, matches/, evaluations/, notes/, objectives/,
    # absences/, injuries/ arrivent avec leurs phases respectives (voir roadmap)
  prisma/
    schema.prisma
    migrations/
    seed.ts
  prisma.config.ts
  Dockerfile
  .env.example
frontend/
  src/
    app/
      [locale]/
        (auth)/login/, (auth)/register/
        (app)/home/, (app)/layout.tsx      # guard client (redirige si non connecté)
        layout.tsx                          # <html>/<body>, NextIntlClientProvider
        page.tsx                            # redirige vers /login
      globals.css
    components/ui/   # shadcn/ui (Tailwind v4)
    i18n/             # routing.ts, navigation.ts, request.ts
    lib/
      api.ts
      auth/auth-context.tsx   # AuthProvider + silent refresh
    proxy.ts          # ex-middleware.ts (convention Next.js 16) : next-intl
  locales/
    fr.json
    en.json
  Dockerfile
  .env.example
docker/
  docker-compose.yml
  .env.example
docs/
CLAUDE.md
.nvmrc                # Node 20 — voir §2bis
```

**Écart avec la structure initialement envisagée** : `schema.prisma` vit dans
`backend/prisma/` (racine du projet backend, emplacement standard attendu par
la CLI Prisma), pas dans `backend/src/prisma/` comme dessiné à l'origine — ce
dossier `src/prisma/` ne contient que le module Nest (`PrismaModule`/`PrismaService`).

### 2bis. Version de Node.js

**Node 20 LTS est requis** (voir `.nvmrc` à la racine). Next.js 16 exige
`>=20.9.0` et Tailwind CSS v4 embarque un moteur natif (`@tailwindcss/oxide`)
non disponible pour Node 18. Le backend (NestJS 11, Prisma 6) fonctionne aussi
bien sous Node 18 que 20, mais tout le monorepo est aligné sur Node 20 pour
éviter les incompatibilités. Utiliser `nvm use` à la racine avant de lancer
les commandes `npm` en local (les images Docker utilisent déjà `node:20-alpine`).

### 2ter. Next.js 16 — `proxy.ts` remplace `middleware.ts`

Next.js 16 renomme la convention de fichier `middleware.ts` en `proxy.ts` (le
nom de fichier suffit à Next pour la détecter). C'est ce fichier qui porte le
middleware `next-intl` de détection/redirection de langue. Le runtime `edge`
n'est plus supporté par `proxy.ts` — seul `nodejs` l'est désormais.

## 5. Principes UX/UI transverses

- **Simplicité** : navigation par onglets/menus distincts adaptés au rôle de l'utilisateur
  connecté. Chaque acteur ne voit que les sections pertinentes pour lui.
- **Responsive mobile** : boutons assez grands pour un usage tactile sur le terrain, police
  lisible en extérieur, vue calendrier adaptée en liste sur petit écran.
- **Flux de travail naturel** : minimiser la friction de saisie.
- **Calendrier visuel** : code couleur par type d'événement (vue coach/joueur) ou par équipe
  (vue AdminClub). Voir `docs/modules/calendrier-evenements.md`.
- **Éditeur graphique d'exercices** : terrain calibré, ajout de pions par bouton, mode dessin de
  flèche. Version MVP simplifiée (pas d'animation, pas de templates avancés au départ).
- **Feedback systématique** : confirmation visuelle (toast) pour chaque action de sauvegarde,
  message d'erreur explicite et localisé en cas de champ manquant.
- **Navigation contextuelle** : la navigation et les menus s'adaptent au(x) rôle(s) actif(s) de
  l'utilisateur pour ne jamais afficher de sections sans droits.

## 6. Tests & qualité

- Tests unitaires (Jest côté NestJS) prioritaires sur :
  - La logique de permission par rôle/scope, **y compris les scénarios multi-rôles**.
  - Le calcul de statistiques et l'agrégation de présences.
  - Toute nouvelle modification des droits doit être couverte par un test de scénario multi-rôles
    avant merge.
- Tests d'intégration basiques sur les routes API clés.
- CI/CD non indispensable pour le MVP, à prévoir ensuite (GitHub Actions + image Docker).

## 7. Évolutions futures à ne pas bloquer dans le design actuel

- Multi-équipes et multi-club (la table `Club` doit rester exploitable).
- Espace communautaire (forum, fil d'actualité, partage de moments d'équipe, photos/vidéos).
- Bibliothèques d'exercices partagées : club → publique → place de marché.
- Statistiques avancées et analyses automatisées.
- Modules organisationnels (covoiturage parents, cotisations, gestion des licences...).
- Extension à d'autres sports (rugby, basket, handball...).

## 8. Roadmap

Voir `docs/roadmap.md`.
