# Schéma — Fondations (Auth, Clubs, Membres, Rôles)

> Entités transverses à toute l'application. Ce fichier est le plus stable du schéma —
> toute modification ici a des répercussions sur l'ensemble des modules.

---

## User — Compte de connexion

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `email` | String, unique | |
| `passwordHash` | String | bcrypt |
| `emailVerified` | Boolean, défaut `false` | |
| `locale` | String, défaut `'fr'` | préférence de langue (i18n) |

---

## RefreshToken — Sessions actives

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `userId` | FK → User | |
| `tokenHash` | String | jamais stocké en clair |
| `expiresAt` | DateTime | |
| `revokedAt` | DateTime, nullable | révocation explicite |

---

## Club

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `name` | String | |
| `sport` | enum `SportType`, défaut `FOOTBALL` | détermine les catégories d'évaluation proposées par défaut |
| `logoUrl` | String, nullable | |
| `primaryColor` | String, nullable | hex |
| `secondaryColor` | String, nullable | hex |
| `country` | String | |
| `city` | String, nullable | |

**Workflow de création** : à la création d'un club, le système génère automatiquement des
`ClubEvaluationConfig` pour toutes les `EvaluationCategory` système correspondant au sport
choisi — toutes activées par défaut. L'AdminClub peut ensuite désactiver, réordonner,
renommer ou ajouter ses propres catégories.

---

## Team — Équipe au sein d'un club

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `clubId` | FK → Club | |
| `name` | String | ex. "U15 A" |

L'historique des catégories et noms par saison est capturé dans `Season.categorySnapshot` et
`Season.teamNameSnapshot` — voir `championnats.md`.

---

## Member — Lien entre un User et un Club

Un même `User` peut être `Member` de plusieurs clubs (un enregistrement par club).

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `userId` | FK → User | |
| `clubId` | FK → Club | |
| `firstName` | String | |
| `lastName` | String | |
| `phone` | String, nullable | |
| `avatarUrl` | String, nullable | |
| `isActive` | Boolean, défaut `true` | |

**Contrainte** : unicité sur `(userId, clubId)` — un User n'a qu'un seul Member par club.

---

## MemberRole — Attribution d'un rôle (RBAC)

C'est ici que réside le système de contrôle d'accès. Un `Member` peut avoir plusieurs lignes
dans cette table (un rôle par contexte club/équipe).

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `memberId` | FK → Member | |
| `roleId` | FK → Role | |
| `clubId` | FK → Club, nullable | `null` = scope global (SuperAdmin / Proprietaire uniquement) |
| `teamId` | FK → Team, nullable | `null` = scope club entier |
| `startDate` | Date, nullable | |
| `endDate` | Date, nullable | historisation des changements de rôle |

**Règle d'évaluation des permissions** : toujours évaluer rôle par rôle, scopé au club et/ou
à l'équipe de la ressource demandée. Jamais de raccourci global. Voir `docs/modules/auth-roles.md`.

---

## Role — Définition d'un rôle

Rôles fixes (système) et rôles personnalisés partagent cette table.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `name` | String | ex. "Coach", "Physiotherapeute" |
| `description` | String, nullable | |
| `isSystem` | Boolean | `true` = rôle fixe, non supprimable |
| `clubId` | FK → Club, nullable | `null` = rôle système global ; non-null = rôle personnalisé d'un club |

**Rôles système** (`isSystem = true`, `clubId = null`) :
`Player`, `Parent`, `Coach`, `AdminClub`, `SuperAdmin`, `Proprietaire`

**Rôles personnalisés** (exemples via preset) : `Physiotherapeute`, `Recruteur`, `Tresorier`...
Créés par un AdminClub ou SuperAdmin via l'interface graphique. Voir `docs/modules/auth-roles.md`.

---

## Permission — Permission granulaire

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `resource` | String | ex. `injury`, `training_session`, `member_note`, `scouting_report` |
| `action` | enum `PermissionAction` | |
| `scope` | enum `PermissionScope` | |
| `description` | String, nullable | libellé lisible pour l'UI de gestion des rôles |

---

## RolePermission — Permissions attribuées à un rôle

| Champ | Type | Notes |
|---|---|---|
| `roleId` | FK → Role | |
| `permissionId` | FK → Permission | |

**Clé primaire composite** : `(roleId, permissionId)`.

---

## Enums

```prisma
// Sport du club — détermine les catégories d'évaluation système proposées par défaut
enum SportType {
  FOOTBALL
  BASKETBALL
  RUGBY
  HANDBALL
  VOLLEYBALL
  // extensible sans refonte — ajouter le sport + ses EvaluationCategory système
}

enum PermissionAction {
  READ
  CREATE
  UPDATE
  DELETE
}

enum PermissionScope {
  OWN    // ses propres données uniquement
  TEAM   // toutes les données de ses équipes
  CLUB   // toutes les données de son club
  ALL    // toutes les données (SuperAdmin / Proprietaire)
}
```

---

## Index

```
@@unique([userId, clubId])          sur Member
@@index([memberId])                 sur MemberRole
@@index([clubId, teamId])           sur MemberRole
@@index([roleId, permissionId])     sur RolePermission (clé primaire composite)
@@index([userId])                   sur RefreshToken
```
