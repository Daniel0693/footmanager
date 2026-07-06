# Module — Auth & Rôles

## Mécanisme d'authentification

- **JWT** : access token de courte durée + refresh token.
- Le refresh token est stocké en **cookie httpOnly** (non accessible en JS côté client).
- **Silent refresh** : le front renouvelle l'access token de façon transparente avant expiration.
- Les tokens sont invalidés côté serveur (table `RefreshToken` avec champ `revokedAt`).

---

## Rôles fixes (système)

Ces rôles sont intégrés à l'application, non supprimables (`isSystem = true`, `clubId = null`).
Ils correspondent à des ensembles de permissions pré-configurés.

| Rôle | Description |
|---|---|
| `Player` | Joueur — accès à son profil, calendrier, convocations, feedback |
| `Parent` | Parent d'un joueur — convocations, confirmation de présence, suivi de l'enfant |
| `Coach` | Entraîneur — gestion complète de séances, matchs, évaluation joueurs (scopé équipe) |
| `AdminClub` | Administrateur d'un club — gestion de l'effectif, des équipes, lecture de tout |
| `SuperAdmin` | Rôle technique le plus élevé — accès multi-club et administration de la plateforme |
| `Proprietaire` | **Au-dessus de SuperAdmin** — propriétaire du club, mécanisme de transfert sécurisé |

**`Proprietaire`** est implémenté dès le MVP. Son transfert (succession) nécessite un mécanisme
sécurisé (ex. validation par email + délai de confirmation, ou validation à double facteur) pour
éviter tout transfert accidentel ou frauduleux. Ce mécanisme est à concevoir et documenter avant
l'implémentation.

---

## Rôles personnalisés (dynamiques)

Les rôles personnalisés sont créés via l'interface graphique par un `AdminClub` (scope club) ou
un `SuperAdmin`/`Proprietaire` (scope plateforme). Ils partagent la table `Role` avec les rôles
fixes, distingués par `isSystem = false` et `clubId` non null (pour un rôle propre à un club).

**Exemple** : un `AdminClub` crée le rôle `Physiotherapeute`, lui attribue les permissions
`injury READ TEAM` et `injury UPDATE TEAM`. Un `Member` reçoit ce rôle via `MemberRole`,
scopé aux équipes où il intervient.

### Permissions granulaires

Chaque permission est la combinaison de trois dimensions :
1. **Ressource** (`resource`) : ex. `injury`, `training_session`, `member_note`, `player_profile`
2. **Action** (`action`) : `READ`, `CREATE`, `UPDATE`, `DELETE`
3. **Scope** (`scope`) : `OWN` (ses propres données), `TEAM` (ses équipes), `CLUB` (son club), `ALL`

L'interface de gestion des rôles expose ces trois dimensions de façon lisible (libellés traduits
via i18n) pour permettre à un AdminClub non-développeur de configurer un rôle personnalisé.

---

## Attribution des rôles — MemberRole

La table `MemberRole` est l'unique source de vérité sur "qui a quel rôle où". Elle lie un
`Member` à un `Role`, scopé à un `Club` et/ou une `Team` (champs nullable selon le rôle).

Exemples :
```
{ memberId: 42, roleId: Coach,    clubId: 1, teamId: 5  }  → Coach de l'équipe U15
{ memberId: 42, roleId: Player,   clubId: 1, teamId: 8  }  → Joueur dans l'équipe Seniors
{ memberId: 42, roleId: Parent,   clubId: 2, teamId: 12 }  → Parent dans un autre club
```

Ce membre a trois rôles distincts, dans trois contextes distincts, avec trois jeux de droits
distincts. Toute évaluation de permission doit considérer le contexte de l'action demandée,
pas un rôle "global" de l'utilisateur.

---

## Règle d'or — évaluation des permissions

**Toujours évaluer la permission via `MemberRole` + `RolePermission`, scopée au contexte
précis de l'action.** Ne jamais court-circuiter ce système.

❌ Interdit :
```ts
if (user.role === 'SuperAdmin') return true;  // contourne le scope
if (user.roles.includes('AdminClub')) return true;  // ignore le club concerné
```

✅ Correct (pseudo-code) :
```ts
function can(member, action, resource, { clubId, teamId }): boolean {
  const roles = getMemberRolesInScope(member, clubId, teamId);
  return roles.some(role =>
    roleHasPermission(role, resource, action, { clubId, teamId })
  );
}
```

**Pourquoi cette règle est critique** : plusieurs modules ont dû être retouchés après coup
à cause de raccourcis de permission. C'est un risque structurel récurrent — documenter ici
tout cas limite découvert pour éviter de répéter l'erreur.

### Implémentation réelle (depuis la Phase 2, module Effectif)

Le pseudo-code ci-dessus est concrètement `PermissionsService.can(memberId, action, resource,
{ clubId, teamId })` (`backend/src/roles/permissions.service.ts`, Phase 1) : filtre les
`MemberRole` actifs du membre correspondant au contexte, résout le scope le plus large accordé
parmi `OWN < TEAM < CLUB < ALL`.

Deux briques supplémentaires branchent cette logique sur les routes HTTP (Phase 2,
`backend/src/auth/guards/permissions.guard.ts`) :

- **`@RequirePermission(resource, action)`** — décorateur posé sur une méthode de controller,
  pose une métadonnée lue par le guard.
- **`PermissionsGuard`** — résout `clubId`/`teamId` depuis les paramètres de route (jamais
  requête DB), résout le `Member` de l'utilisateur via `MembersService.findByUserAndClub`, puis
  appelle `PermissionsService.can()`. Si un scope est accordé, attache `request.member` et
  `request.permissionScope` (récupérables via `@CurrentMember()` / `@CurrentPermissionScope()`)
  pour que le service applique un filtrage fin (ex. scope `OWN` → ne renvoyer que la ressource de
  l'appelant).

**Convention de route qui en découle** : toute route dont la permission peut être scopée `TEAM`
doit porter `clubId` **et** `teamId` explicitement dans l'URL (ex.
`/clubs/:clubId/teams/:teamId/players`), jamais résolus implicitement — le guard ne fait aucune
requête DB pour les déduire.

---

## Cas particuliers documentés

### Staff technique d'une équipe (Coach, Co-entraîneur, Adjoint)

La table `TeamStaff` (`staffRole` : `PRINCIPAL`, `CO_ENTRAINEUR`, `ADJOINT`) définit le rôle
précis d'un Coach au sein d'une équipe. En termes de droits applicatifs :
- **Parité complète** entre `PRINCIPAL`, `CO_ENTRAINEUR` et `ADJOINT` sur la gestion de
  l'équipe (séances, matchs, évaluations) — y compris sur `team_staff` lui-même (CRUD complet,
  pas seulement lecture : une première version du seed n'avait donné que `READ` au rôle Coach,
  ce qui rendait l'exception ci-dessous vide de sens puisqu'il n'y avait rien à modifier).
- **Exception unique** : un Adjoint ou Co-entraîneur ne peut pas modifier ou retirer la fiche
  `TeamStaff` d'un *autre* membre Principal (protection contre l'auto-promotion). Il peut
  modifier sa propre fiche même si elle est Principal. Un scope `CLUB`/`ALL` (AdminClub,
  SuperAdmin) n'est jamais restreint par cette règle.
  **Cette règle n'est pas exprimable dans le système de permission générique** (même rôle, même
  scope, seule la ligne ciblée diffère) : elle est appliquée explicitement dans
  `TeamStaffService.assertCanModifyPrincipal()`, pas dans `PermissionsService`.

### Patterns découverts en implémentant le module Effectif (Phase 2)

Ces cas limites ont cassé silencieusement (403 sans message clair, ou pire — un tableau vide
sans erreur visible côté frontend) avant d'être identifiés en testant manuellement avec
plusieurs rôles. À connaître avant d'implémenter le module Calendrier (Partie B), qui aura les
mêmes scopes `TEAM` sur `Coach`/`Player`.

**Un scope `TEAM` ne peut jamais matcher une route de liste sans `:teamId` dans l'URL.**
`PermissionsGuard` résout `clubId`/`teamId` uniquement depuis les paramètres de la requête
(jamais de requête DB) ; si une route liste une ressource "globale" (ex. `GET /clubs/:clubId/teams`
— toutes les équipes d'un club), un `MemberRole` scopé à une équipe précise (`teamId` non null)
ne correspond à aucun contexte résolvable, et le guard refuse **avant même** d'atteindre le
service — y compris pour un Coach qui devrait légitimement voir sa propre équipe.

*Solution retenue* : une route self-service dédiée qui contourne `PermissionsGuard` et résout
elle-même l'accès, à la place d'un raccourci de rôle interdit par la règle d'or :
- `GET /clubs/:clubId/players/me` — un Player consulte son propre profil (résolution d'identité
  pure depuis le JWT, aucune évaluation de scope nécessaire).
- `GET /clubs/:clubId/teams/mine` — un membre consulte les équipes auxquelles il a accès :
  club entier si son scope est `CLUB`/`ALL` (vérifié via `PermissionsService.can()` sans
  `teamId`, qui matche les `MemberRole` club-entiers dont `teamId` est `null`), sinon repli sur
  les équipes où il a un `MemberRole` scopé équipe — sans consulter le moteur RBAC générique
  pour ce cas, puisque "voir les équipes dont je suis membre" est vrai par construction.

Ce pattern (route `/me` ou `/mine`, guard générique contourné, résolution directe dans le
service) est à réutiliser pour toute future route de listing consommée par un rôle scopé équipe
sans que la ressource elle-même porte de `teamId` dans son URL naturelle.

**La même limitation s'applique à toute route portant sur une ressource déjà identifiée par id
(GET/PATCH), pas seulement au listing.** `GET`/`PATCH /clubs/:clubId/players/:id` et
`PATCH /clubs/:clubId/members/:id` (étape A6) portent des permissions accordées au Coach avec un
scope `TEAM` dans le seed ("consulter/modifier les profils/membres de ses équipes") — mais leur
URL ne porte pas de `teamId`, donc un Coach reçoit un 403 malgré sa permission. *Trouvé en testant
manuellement* : l'Entraîneur (Daniel) ne pouvait pas ouvrir la fiche d'un joueur de sa propre
équipe ("Impossible de charger le profil du joueur").

*Solution retenue ici* : plus légère que la route self-service `/me`/`/mine` ci-dessus — quand
l'appelant connaît déjà le `teamId` pertinent (le frontend est toujours dans un contexte équipe
identifié : fiche joueur, formulaire d'édition depuis l'effectif), il suffit de le transmettre en
query string (`?teamId=5`). `PermissionsGuard` résout déjà `clubId`/`teamId` depuis les params, le
body, **ou la query** (voir plus haut) — aucun changement backend n'est nécessaire, seul l'appel
frontend doit inclure le paramètre. Utilisé par la fiche joueur
(`GET /clubs/:clubId/players/:id?teamId=`) et par `PlayerFormDialog` en mode édition
(`PATCH /clubs/:clubId/members/:id?teamId=` et `PATCH /clubs/:clubId/players/:id?teamId=`).

*Quand utiliser quoi* : la route self-service `/me`/`/mine` convient quand l'appelant ne connaît
pas encore le teamId pertinent (ex. "quelles sont mes équipes ?" avant même d'en avoir choisi
une) ; le paramètre `?teamId=` en query convient quand le frontend est déjà dans un contexte
équipe identifié et peut simplement le transmettre.

**Le paramètre `?teamId=` transmis en query n'est vérifié par `PermissionsGuard` que pour
résoudre le SCOPE (Coach a-t-il un rôle sur CE teamId ?) — jamais pour vérifier que la
RESSOURCE ciblée par l'URL appartient bien à cette équipe.** Faille trouvée en concevant A7.3
(Notes) : `PlayersService.findOne/update/remove`, `PlayerMeasurementsService` et
`PlayerInterviewsService` ne vérifiaient que l'appartenance du joueur au **club** (via
`assertPlayerInClub`), jamais à l'équipe précise transmise en query. Un Coach de l'équipe 8
pouvait donc consulter/modifier/supprimer les mesures, entretiens ou le profil de **n'importe
quel joueur du club**, y compris d'une équipe où il n'a aucun rôle, simplement en transmettant
sa propre équipe (`?teamId=8`) — la guard ne pouvait pas détecter le problème puisqu'elle ne
raisonne que sur "ce membre a-t-il un rôle sur cette équipe", jamais sur la ressource ciblée.

*Solution retenue* : `assertPlayerInTeam(prisma, playerId, teamId)` (`src/common/player-team-membership.ts`)
vérifie qu'une affectation **active** (`PlayerTeam.leaveDate: null`) existe entre le joueur ciblé
et le `teamId` transmis. Appelée par le service (jamais par le guard, qui reste générique) chaque
fois que `requester.scope === 'TEAM'`, en plus (jamais à la place) de la vérification
club/scope OWN existante. Coach/AdminClub/SuperAdmin gardent un comportement inchangé pour les
joueurs réellement dans leur périmètre. **Pattern à réutiliser pour toute nouvelle ressource
scopée équipe** (Notes, Objectifs, Évaluation...) — ne pas se contenter de `assertPlayerInClub`
dès qu'un scope `TEAM` existe sur la permission.

**Le scope global (`clubId = null` sur `MemberRole`) ne dispense pas d'une fiche `Member` par
club accédé.** `PermissionsGuard` résout toujours le `Member` de l'appelant pour le `clubId` de
la requête (`MembersService.findByUserAndClub`) avant même d'évaluer la permission — un
SuperAdmin ou Proprietaire dont le `MemberRole` a `clubId = null` (scope théoriquement
multi-club) doit malgré tout avoir une fiche `Member` dans **chaque** club où il opère, sans
quoi le guard refuse dès la résolution du membre. En pratique, un SuperAdmin n'est donc
aujourd'hui pas "global" au sens propre — il faut lui créer un `Member` par club à couvrir. Un
vrai mécanisme multi-club sans cette limitation reste à concevoir si le besoin se confirme
(voir "Multi-club" dans `docs/roadmap.md` §Évolutions post-MVP).

### Multi-rôles — règle de test obligatoire

**Toute modification touchant aux droits doit être testée avec au moins un scénario multi-rôles
avant merge.** Exemple de scénario de référence :

> Marc est Coach de l'équipe U15 (Club A), Player dans l'équipe Seniors (Club A), et Parent
> d'un joueur dans l'équipe U10 (Club B).
> - En tant que Coach U15 : il voit et édite les séances/matchs de l'U15, pas des autres.
> - En tant que Player Seniors : il voit son propre profil et les événements Seniors, sans
>   accès aux données des autres joueurs.
> - En tant que Parent Club B : il voit le calendrier et les convocations de l'équipe U10 de
>   son enfant, sans aucun accès au Club A via ce rôle.

Si une modification de la logique de permission casse ce scénario dans un sens ou dans l'autre,
elle ne peut pas être mergée.

### Propriétaire — mécanisme de transfert sécurisé

Le transfert du rôle `Proprietaire` doit passer par une procédure sécurisée (à détailler avant
implémentation) : validation par email, délai de confirmation, log d'audit irréversible.

---

## Tests de permission — exigences minimales

Pour chaque module, une suite de tests doit couvrir :
1. Un utilisateur sans aucun rôle ne peut rien faire.
2. Chaque rôle système peut faire exactement ce qu'il doit faire (ni plus, ni moins).
3. Un rôle scopé équipe A ne peut pas accéder aux données de l'équipe B.
4. Un scénario multi-rôles (au moins un test du type "Marc" décrit ci-dessus).
5. Un rôle personnalisé avec permissions limitées respecte ces limites.
