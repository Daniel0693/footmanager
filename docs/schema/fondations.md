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
| `category` | enum `TeamCategory`, nullable | pyramide suisse standard (Phase 4, B10, 2026-07-17) — nullable pour les équipes existantes non catégorisées, mais requis à la création d'une nouvelle équipe (`CreateTeamDto`). Source de la suggestion de `GameFormat` par défaut à la création directe d'un match (`docs/modules/matchs.md` §Format de jeu), jamais une contrainte |

```prisma
enum TeamCategory {
  U9
  U11
  U13
  U15
  U17
  U19
  SENIORS
}
```

`Season` (calendrier de saisons) est désormais rattachée au `Club`, pas à `Team` — révision A14,
voir `championnats.md`. Aucun historique de catégorie/nom par saison n'est capturé pour
l'instant (les champs `teamNameSnapshot`/`categorySnapshot` envisagés en conception n'ont
jamais été implémentés et n'auraient de toute façon plus de sens au niveau club, qui regroupe
plusieurs équipes de noms/catégories différents). **`Team.category` (B10) ne contredit pas cette
décision** : il vit sur l'équipe elle-même, jamais sur `Season` (club-wide), donc aucun conflit
avec le regroupement multi-catégories d'un club.

---

## Member — Lien entre un User (optionnel) et un Club

Un même `User` peut être `Member` de plusieurs clubs (un enregistrement par club).

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `userId` | FK → User, **nullable** | `null` = membre sans compte de connexion (voir ci-dessous) |
| `clubId` | FK → Club | |
| `firstName` | String | |
| `lastName` | String | |
| `phone` | String, nullable | |
| `avatarUrl` | String, nullable | |
| `gender` | enum `Gender`, nullable | `MALE` \| `FEMALE` \| `OTHER` — non renseigné par défaut |
| `birthDate` | Date, nullable | commun à tous les rôles (2026-07-08 : déplacé depuis `PlayerProfile`, un Coach/Parent/AdminClub a aussi un anniversaire) — alimente les anniversaires du calendrier |
| `isActive` | Boolean, défaut `true` | |

**Contrainte** : unicité sur `(userId, clubId)` — un User n'a qu'un seul Member par club. `NULL`
n'étant jamais égal à `NULL` en SQL, cette contrainte n'empêche pas plusieurs membres sans compte
dans le même club (comportement voulu).

**Membres sans compte** : un club peut créer une fiche `Member` sans `User` associé (`userId =
null`) — cas des jeunes catégories ou de toute personne que le club veut répertorier sans lui
donner d'accès à l'application. Créé via `POST /clubs/:clubId/members` (permission `member
CREATE`). Rien n'empêche de rattacher un `User` à ce `Member` plus tard (mécanisme d'invitation
non implémenté au MVP). Voir aussi `docs/modules/effectif-joueurs.md` §Joueurs sans compte.

**Édition** : `PATCH /clubs/:clubId/members/:id` (permission `member UPDATE`). Cette route ne porte
pas de `teamId` dans l'URL : un appelant scopé `TEAM` (Coach) doit le transmettre en query string
(`?teamId=`) pour être autorisé — voir `docs/modules/auth-roles.md` §"Patterns découverts".

---

## MemberRole — Attribution d'un rôle (RBAC)

C'est ici que réside le système de contrôle d'accès. Un `Member` peut avoir plusieurs lignes
dans cette table (un rôle par contexte club/équipe).

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `memberId` | FK → Member | |
| `roleId` | FK → Role | |
| `clubId` | FK → Club, nullable | `null` = mécanisme legacy inerte, voir note ci-dessous |
| `teamId` | FK → Team, nullable | `null` = scope club entier |
| `startDate` | Date, nullable | |
| `endDate` | Date, nullable | historisation des changements de rôle |

**Règle d'évaluation des permissions** : toujours évaluer rôle par rôle, scopé au club et/ou
à l'équipe de la ressource demandée. Jamais de raccourci global. Voir `docs/modules/auth-roles.md`.

**`clubId = null` — mécanisme legacy inerte.** Historiquement utilisé pour tenter un scope
global SuperAdmin/Proprietaire, mais nécessitait quand même une fiche `Member` par club accédé
(la résolution du `Member` de l'appelant se fait toujours pour le `clubId` précis de la requête,
avant même d'évaluer la permission) — ce qui rendait ces rôles non réellement "globaux" en
pratique. Depuis l'introduction de `UserRole` (ci-dessous), plus aucun code ne produit de
`MemberRole` avec `clubId = null`, et `PermissionsService.matchesContext` ne l'auto-matche plus
non plus (traité comme un `clubId` non correspondant — refusé). La colonne reste nullable
uniquement pour ne pas casser d'éventuelles données pré-existantes en base. Le mécanisme courant
pour un accès plateforme réel, indépendant de tout club, est `UserRole`. Détail :
`docs/modules/auth-roles.md` §Rôles plateforme.

---

## UserRole — Attribution d'un rôle plateforme (indépendant du club)

Attribution directe d'un `Role` à un `User`, sans passer par `Member`/`Club` — réservée en
pratique aux rôles système globaux (`SuperAdmin`, `Proprietaire`). C'est le mécanisme qui
permet à ces rôles d'accéder à n'importe quel club sans y avoir de fiche `Member` préalable.
Voir `docs/modules/auth-roles.md` §Rôles plateforme pour le détail du fonctionnement
(`PermissionsService.canAsUser`/`canEffective`, provisioning différé du `Member`) et le script
de bootstrap (`backend/scripts/bootstrap-platform-role.ts`), seul moyen d'attribuer un
`UserRole` aujourd'hui (pas d'interface de gestion self-service en MVP).

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `userId` | FK → User | |
| `roleId` | FK → Role | |
| `startDate` | Date, nullable | |
| `endDate` | Date, nullable | historisation — un rôle révoqué (via `endDate`) peut être regranté comme une nouvelle ligne, pas de contrainte unique |

---

## ParentChild — Liaison Parent ↔ Joueur

Lien direct entre un `Member` Parent et un `Member` enfant (docs/decisions-ouvertes-et-rgpd.md
#5, tranché — voir `docs/modules/auth-roles.md` §Rôle Parent). Donne accès au scope
`PermissionScope.PARENT` sur les ressources de l'enfant. Créé/supprimé uniquement par le staff
(Coach/AdminClub/SuperAdmin) via `POST`/`DELETE /clubs/:clubId/players/:playerId/parents` —
jamais par le Parent lui-même (donnée sensible sur un mineur, pas une auto-déclaration).

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `parentMemberId` | FK → Member | |
| `childMemberId` | FK → Member | |

**Contrainte** : unicité sur `(parentMemberId, childMemberId)` — un même lien ne peut exister
qu'une fois (un enfant peut avoir plusieurs parents liés, un parent peut avoir plusieurs enfants).
Pas de `startDate`/`endDate` (contrairement à `MemberRole`/`UserRole`) : un lien erroné se corrige
par suppression, pas par historisation — même logique que `ChampionshipParticipant`.

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
  PARENT // les données d'un enfant lié via ParentChild (jamais plus)
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
@@index([userId])                   sur UserRole
```
