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
| `SuperAdmin` | Personnel de la plateforme FootManager — accès complet à tous les clubs, pour aider AdminClub/Entraîneurs |
| `Proprietaire` | **Même niveau que SuperAdmin** — propriétaire de la plateforme elle-même, pas d'un club en particulier |

**`SuperAdmin` et `Proprietaire` sont des rôles plateforme** : ils ne sont rattachés à aucun club
directement (contrairement à `Player`/`Parent`/`Coach`/`AdminClub`, toujours attribués via une
fiche `Member` d'un club précis). Un même individu peut cumuler un rôle plateforme ET un rôle
club-scopé ordinaire (ex. Entraîneur d'une équipe dans un club où il joue lui-même) — voir §Rôles
plateforme ci-dessous pour le mécanisme (`UserRole`) et la règle d'union appliquée dans ce cas.
Hiérarchie de rang (succession/priorité, pas un raccourci de permission) :
Propriétaire > AdminSystème (SuperAdmin) > AdminClub (gère un club) > Entraîneur (Coach
`staffRole = PRINCIPAL`, gère une équipe) > Coach (`ADJOINT`/`CO_ENTRAINEUR`, sous les ordres de
l'Entraîneur) > Joueur/Parent.

**`Proprietaire`** est implémenté dès le MVP. Son transfert (succession, entre deux titulaires du
rôle plateforme) nécessite un mécanisme sécurisé (ex. validation par email + délai de
confirmation, ou validation à double facteur) pour éviter tout transfert accidentel ou frauduleux
— à concevoir et documenter avant l'implémentation (Phase 9, hors scope du mécanisme `UserRole`
lui-même).

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
  ce qui rendait les exceptions ci-dessous vides de sens puisqu'il n'y avait rien à modifier/créer).
- **Trois exceptions**, aucune exprimable dans le système de permission générique (même rôle,
  même scope, seule la ligne/valeur ciblée diffère) — appliquées explicitement dans
  `TeamStaffService`, pas dans `PermissionsService` :
  - un Adjoint ou Co-entraîneur ne peut pas modifier ou retirer la fiche `TeamStaff` d'un
    *autre* membre Principal (protection contre l'auto-promotion, `assertCanModifyPrincipal`).
    Il peut modifier sa propre fiche même si elle est Principal ;
  - **créer** une affectation de staff (n'importe quel `staffRole`) est réservé, en scope
    `TEAM`, au Principal en poste sur cette équipe (`assertCanCreateStaff`, décision du
    2026-07-16) — un Adjoint/Co-entraîneur ne peut pas ajouter de staff, même si
    `team_staff CREATE` (scopé `TEAM`) lui est accordé génériquement par le rôle `Coach` ;
  - **assigner** `PRINCIPAL` (création ou promotion via `update`) est réservé au scope
    `CLUB`/`ALL` (`assertCanAssignPrincipal`, décision du 2026-07-16) — même le Principal en
    poste ne peut ni se remplacer ni promouvoir quelqu'un à ce rang.
  Un scope `CLUB`/`ALL` (AdminClub, SuperAdmin, Proprietaire) n'est jamais restreint par aucune
  de ces trois règles.
- **`TeamStaffService` crée/révoque aussi le `MemberRole` Coach** (scopé `clubId`+`teamId`) en
  même temps que le `TeamStaff` — les deux dans une même transaction, voir
  `docs/modules/effectif-joueurs.md` §B5.5. Sans cette écriture jointe, un membre du staff créé
  via l'API n'a historiquement jamais reçu la moindre permission (constat en usage réel,
  2026-07-16) : `MemberRole` reste l'unique source de vérité des permissions (`PermissionsService`
  ne consulte jamais `TeamStaff`), donc un `TeamStaff` sans `MemberRole` correspondant laisse ce
  membre sans aucun droit malgré une fiche staff visible.

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
sans que la ressource elle-même porte de `teamId` dans son URL naturelle. Occurrences actuelles,
toutes sans `@RequirePermission` par construction (commentaire court dans le code renvoyant
ici) : `GET /clubs/:clubId/players/me`, `GET /clubs/:clubId/teams/mine`,
`GET/PATCH /clubs/:clubId/members/me`, `GET /clubs` ("mes clubs"),
`GET /clubs/:clubId/events/mine`.

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
(`PATCH /clubs/:clubId/members/:id?teamId=` et `PATCH /clubs/:clubId/players/:id?teamId=`), par
`evaluation_config` (`GET /clubs/:clubId/evaluation-config?teamId=`, Coach/Player en lecture
seule), par `season` depuis la révision A14 (`GET /clubs/:clubId/seasons?teamId=`, Coach et
Player n'ont que `season READ` scope `TEAM` — la gestion est réservée à AdminClub, scope `CLUB`
qui n'a pas besoin de `?teamId=`, voir `docs/modules/saisons-championnats.md` §Droits par rôle),
et par `external_team` (Partie B) : `ExternalTeam` est club-scopé en base (pas de `teamId`,
une équipe adverse peut affronter plusieurs équipes du club) mais accordé au Coach en scope
`TEAM` — `clubs/:clubId/external-teams?teamId=`. Contrairement à `season`, le Coach connaît
toujours son `teamId` en appelant cette route (il gère les équipes adverses depuis l'écran de
championnat de sa propre équipe) : c'est le deuxième cas ci-dessous, pas le troisième. **Ne
jamais élargir ce rôle à un scope `CLUB`** — violerait la Règle d'or de `CLAUDE.md` (un Coach
n'a de droits que sur SES équipes, jamais tout le club).

*Quand utiliser quoi* : la route self-service `/me`/`/mine` convient quand l'appelant ne connaît
pas encore le teamId pertinent (ex. "quelles sont mes équipes ?" avant même d'en avoir choisi
une) ; le paramètre `?teamId=` en query convient quand le frontend est déjà dans un contexte
équipe identifié et peut simplement le transmettre.

**Troisième cas, distinct des deux ci-dessus : une page club-wide en LECTURE SEULE, sans
contexte équipe du tout dans son URL, consommée par un rôle scopé `TEAM`.** Trouvé en corrigeant
un bug signalé par l'utilisateur : la liste des saisons (`clubs/:clubId/seasons`, aucun `:teamId`
dans son URL depuis la révision A14) renvoyait 403 pour un Coach/Player alors que leur permission
`season READ TEAM` aurait dû les autoriser — le frontend de cette page ne transmettait tout
simplement jamais `?teamId=`, faute de connaître une équipe (contrairement à la fiche joueur,
toujours ouverte depuis un contexte équipe). Ici, peu importe LAQUELLE des équipes de l'appelant
est transmise : la ressource elle-même (`Season`) ne filtre jamais par équipe, seule la
**présence** d'un `teamId` où l'appelant a un rôle compte pour satisfaire `PermissionsGuard`.

*Solution retenue* : `frontend/src/lib/resolve-any-team.ts` (`resolveAnyTeamId(clubId, userId,
accessToken)`) — repli sur `last-team.ts` (équipe déjà mémorisée pour ce club) puis, à défaut, sur
`GET /clubs/:clubId/teams/mine` (voir pattern self-service ci-dessus), et prend la première
équipe renvoyée. Un scope `CLUB`/`ALL` (AdminClub+) n'a besoin d'aucun `teamId`, mais en recevoir
un ne change rien à son autorisation (le guard ne le vérifie que si le scope résolu est `TEAM`)
— pas besoin de distinguer les deux cas côté frontend. Utilisé par la liste des saisons, la fiche
de saison, et pour masquer le lien "Saisons" de la sidebar (`SidebarNav`) quand la réponse est un
403 explicite (ex. Parent, qui n'a aucune permission `season`, voir
`docs/modules/saisons-championnats.md` §Droits par rôle) — jamais déduit d'un rôle côté client.

**Quatrième cas, à l'opposé du troisième : une vue club-wide en LECTURE SEULE, consommée à la
fois par un scope `CLUB` (sans filtrage) et un scope `ALL` (sélecteur de club côté frontend),
avec un scope `TEAM` désormais explicitement filtré côté service — pas seulement "refusé par le
guard" comme supposé initialement.** Introduit en B16 : `GET /clubs/:clubId/seasons/:seasonId/
championships` (`SeasonChampionshipsController`) liste les championnats d'une saison **toutes
équipes du club confondues** ; étendu en B20 : `GET /clubs/:clubId/championships`
(`ClubChampionshipsController`) liste tous les championnats du club (colonne Équipe côté
frontend, `ChampionshipsPageContent`), avec sélecteur de club pour SuperAdmin/Proprietaire (scope
`ALL`, `GET /clubs` — depuis l'introduction des rôles plateforme (§Rôles plateforme ci-dessus),
renvoie tous les clubs pour ces deux rôles, plus seulement ceux où l'appelant a une fiche
`Member`).

**Faille corrigée en B20, présente depuis B16** : la documentation initiale de B16 affirmait "un
Coach/Player (scope TEAM) reçoit toujours 403, quel que soit le `?teamId=` fourni (non lu par le
frontend pour cette route)" — **faux**. `PermissionsGuard` résout `teamId` depuis
`request.query` **indépendamment de ce que déclare le contrôleur** (voir la citation ci-dessous,
"le paramètre `?teamId=` ... n'est vérifié... que pour résoudre le SCOPE") : un Coach transmettant
manuellement `?teamId=<sa propre équipe>` sur cette route passait bel et bien le guard (scope
résolu `TEAM`, qui matche), et le SERVICE ne filtrait alors sur aucun `teamId` — un Coach pouvait
donc voir les championnats de **toutes** les équipes du club pour cette saison, pas seulement la
sienne, en devinant simplement l'URL. Le frontend ne déclenchant jamais ce cas (il n'appelle cette
route que lorsque le scope est déjà CLUB/ALL), le bug était invisible en usage normal — trouvé en
construisant `ClubChampionshipsController` sur le même modèle et en réalisant que le "non lu par
le frontend" n'est jamais une garantie de sécurité.

**Solution retenue (les deux contrôleurs)** : `@CurrentPermissionScope()` (voir plus haut) +
`?teamId=` transmis au service comme `requester: {scope, teamId}` — `ChampionshipsService
.findAllBySeason`/`findAllByClub` filtrent explicitement `where: { teamId: requester.scope ===
'TEAM' ? requester.teamId : undefined }`. Un Coach/Player scope TEAM ne voit donc plus que sa
propre équipe même s'il force `?teamId=`, un scope CLUB/ALL n'est pas filtré (`teamId: undefined`,
Prisma ignore ce filtre). **Pattern à réutiliser pour toute future vue "cross-équipe" de ce
type** : ne jamais supposer qu'une route est inatteignable par un scope TEAM simplement parce que
le frontend ne construit jamais cet appel — le filtrage doit vivre dans le service, à partir du
scope réellement résolu par le guard, pas dans la présence ou l'absence d'un paramètre côté
frontend.

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

**Limitation multi-club — résolue.** Le scope global (`clubId = null` sur `MemberRole`) ne
dispensait historiquement pas d'une fiche `Member` par club accédé : `PermissionsGuard` résolvait
toujours le `Member` de l'appelant pour le `clubId` de la requête avant même d'évaluer la
permission, donc un SuperAdmin/Proprietaire scopé "global" via `MemberRole.clubId = null` devait
malgré tout avoir une fiche `Member` dans **chaque** club où il opérait, sans quoi le guard
refusait dès la résolution du membre — un SuperAdmin n'était donc pas "global" au sens propre.
Corrigé par l'introduction du mécanisme `UserRole` (§Rôles plateforme ci-dessous) : ces deux rôles
ne passent plus du tout par `MemberRole`/`Member` pour leur autorisation. `MemberRole.clubId =
null` n'est plus produit par aucun code et n'est plus honoré par le moteur (`matchesContext`
la traite comme un `clubId` non correspondant — refusée, pas auto-matchée) : c'est un mécanisme
legacy entièrement inerte, la colonne restant nullable uniquement pour ne pas casser
d'éventuelles données pré-existantes en base.

### Rôles plateforme — `UserRole`

`SuperAdmin`/`Proprietaire` (les seuls rôles concernés en pratique — réservés au personnel
FootManager, docs/roadmap.md) obtiennent leur accès via une nouvelle table `UserRole`
(`User` ↔ `Role`, **sans** `Member` ni `Club`, docs/schema/fondations.md §UserRole) plutôt que via
`MemberRole`. Deux méthodes dédiées sur `PermissionsService` :

- **`canAsUser(userId, action, resource)`** — équivalent de `can()` mais sourcé sur `UserRole` ;
  pas de `matchesContext` (un `UserRole` est par construction indépendant de tout club/équipe).
- **`hasActivePlatformRole(userId)`** — existence pure (pas de résolution fine), utilisée pour
  décider s'il faut provisionner un `Member` (ci-dessous) ou étendre la visibilité de
  `ClubsService.findAllForUser` à tous les clubs.

**`PermissionsGuard` appelle `PermissionsService.canEffective(userId, memberId, action, resource,
context)`**, pas `can()` seul : union du scope obtenu via le `Member` local (s'il existe) et du
scope obtenu via `canAsUser()`. Décision produit explicite : un Propriétaire/AdminSystème qui
détient *aussi* une fiche `Member` ordinaire dans un club (ex. il y est inscrit comme Joueur)
garde l'accès complet de son rôle plateforme dans ce club — le rôle plateforme ne se laisse jamais
réduire par un rôle local plus restreint.

**Provisioning différé du `Member`** : beaucoup de code en aval (`@CurrentMember()`, champs
d'audit comme `authorId`/`evaluatorId`...) suppose un `Member` réel et persisté. Quand l'accès
d'un appelant ne vient que de son rôle plateforme et qu'aucun `Member` n'existe encore pour ce
club, `MembersService.resolveOrProvisionMember(userId, clubId)` en crée un à la volée (`upsert`,
jamais `create`, pour rester idempotent sous requêtes concurrentes) — **uniquement après que
l'autorisation a réussi**, jamais avant (un utilisateur sans droit ne doit jamais pouvoir créer de
`Member` en sondant des `clubId` arbitraires). `Member.firstName`/`lastName` sont requis mais
`User` n'a aucun champ nom : le placeholder utilise la partie locale de l'email
(`firstName`) et le littéral `"(compte plateforme)"` (`lastName`) — trivialement corrigible
ensuite via `PATCH /clubs/:clubId/members/:id`. Ce même helper remplace les résolutions
`findByUserAndClub` + `throw AUTH.FORBIDDEN` manuelles des routes qui contournent déjà
`PermissionsGuard` (`findMe`/`updateMe`/`findBirthdaysInClub`, `TeamsService`/`EventsService
.findMineInClub`, `PlayersService.findMe`).

**Bootstrap** : aucune UI/API self-service pour accorder un `UserRole` en MVP (item reporté,
docs/roadmap.md Phase 9). Le tout premier `Proprietaire`/`SuperAdmin` — et tout ajout ultérieur
tant que cette UI n'existe pas — s'obtient via `backend/scripts/bootstrap-platform-role.ts`
(`npm run bootstrap:platform-role -- --email=... --role=... --confirm`), volontairement hors de
`seed.ts` (rejoué régulièrement pour les données système, jamais pour des attributions
instance-spécifiques). Voir le test de référence
`backend/src/common/platform-role-multi-role.integration.spec.ts` (persona "Alice", `UserRole`
Proprietaire, aucun `Member` nulle part — accès accordé et `Member` provisionné à la volée sur
plusieurs clubs jamais visités).

**`matchesContext()` exige une correspondance de `teamId` dès que le `MemberRole` en porte un —
y compris pour une permission en scope `OWN`, qui ne devrait pourtant pas dépendre d'une
équipe.** Trouvé en A8 (smoke test bout-en-bout) : un Player omettant `?teamId=` reçoit un 403
même pour lire ses propres mesures/entretiens/notes/objectifs/évaluations. Sans impact
aujourd'hui (la fiche joueur transmet toujours `teamId`, voir §"Le paramètre `?teamId=`..."
ci-dessus), mais à garder en tête pour tout futur module/client qui interrogerait une ressource
scopée `OWN` sans passer par un écran ancré à une équipe précise. Décision ouverte, piste de
correction et justification du report : voir `docs/decisions-ouvertes-et-rgpd.md` #6.

**Un Coach ne pouvait pas ajouter un joueur à sa propre équipe (403 systématique).** Trouvé le
2026-07-07 en test manuel réel (bouton "Ajouter un joueur" visible et actionnable pour un Coach
depuis l'effectif, mais premier appel — `POST /clubs/:clubId/members` — refusé). Cause : le seed
n'accordait `member CREATE`/`player_profile CREATE` qu'aux scopes `CLUB`/`ALL` (AdminClub,
SuperAdmin), jamais `TEAM` (Coach) — contrairement à `player_team CREATE`, déjà accordé. Corrigé
en ajoutant `member CREATE TEAM` et `player_profile CREATE TEAM` au rôle Coach dans le seed, **et**
en transmettant `?teamId=` sur les deux appels de création côté frontend
(`PlayerFormDialog`, mode création) — ces routes ne portent pas `teamId` dans leur URL naturelle,
même limitation que pour l'UPDATE (voir plus haut). Tests de régression dans
`members-permissions.integration.spec.ts` et `players-permissions.integration.spec.ts`.

**Les agrégations "mine" (`TeamsService.findMineInClub`, `EventsService.findMineInClub`,
`MembersService.findBirthdaysInClub`) utilisent l'existence d'un `MemberRole` scopé équipe comme
proxy d'accessibilité, jamais la permission précise du rôle sur la ressource agrégée.** Trouvé en
B9 (scénario multi-rôles Calendrier,
`backend/src/common/calendrier-multi-role.integration.spec.ts`) : ces méthodes contournent
volontairement `PermissionsGuard` (voir le pattern route `/mine` ci-dessus) et, faute de scope
club-entier, retombent sur "l'appelant a-t-il UN `MemberRole` quelconque avec un `teamId` non nul
sur cette équipe ?" — une requête relationnelle directe sur `MemberRole`, qui ne revérifie pas que
LA permission demandée (`event READ`, `member READ`...) est bien accordée à CE rôle précis sur
CETTE équipe. Concrètement : un rôle qui obtiendrait un jour un `MemberRole` scopé équipe sans la
permission `event`/`member` correspondante verrait quand même le calendrier/les anniversaires de
cette équipe via `/mine`, uniquement parce que le `MemberRole` existe. C'est précisément le cas du
rôle `Parent` depuis que la liaison ParentChild est câblée (décision ouverte #5, tranchée — voir
§Rôle Parent ci-dessous) : son `MemberRole` est typiquement scopé à l'équipe de son enfant, sans
que `Parent` porte de permission `event`/`member` à ce scope équipe (seulement `PARENT`, résolu
différemment). Exposition acceptée telle quelle, cohérente avec le comportement déjà établi de
`TeamsService.findMineInClub` (Phase 3, antérieur au module Calendrier) : limitée aux anniversaires
des coéquipiers de l'enfant (pas de tout le club), jamais aux ressources scopées joueur (notes,
absences...) qui passent par le moteur RBAC générique, pas par ce raccourci `/mine`. À revoir si un
jour ce loophole doit couvrir une donnée plus sensible.

### Rôle Parent — liaison `ParentChild`

Décision ouverte #5 (`docs/decisions-ouvertes-et-rgpd.md`), tranchée : un mineur ne pouvant pas se
connecter, son Parent agit à sa place sur son enfant précis — jamais sur le reste de l'équipe.
Trois droits concrets : consulter les informations de l'enfant, modifier ses informations
personnelles (jamais les données foot), déclarer une absence à venir pour lui.

**Mécanisme** : nouvelle table `ParentChild` (`docs/schema/fondations.md`), créée/supprimée
uniquement par le staff (Coach/AdminClub/SuperAdmin, permission `parent_child`
CREATE/READ/DELETE) via `POST`/`GET`/`DELETE /clubs/:clubId/players/:playerId/parents` — jamais
par le Parent lui-même. Un nouveau scope `PARENT` (enum `PermissionScope`) est accordé au rôle
Parent pour `member` (READ/UPDATE), `player_profile`/`player_measurement`/`player_evaluation`/
`player_interview`/`player_note`/`player_objective`/`player_absence` (READ), et `player_absence`
CREATE — voir `backend/prisma/seed.ts`. `GET /clubs/:clubId/parent-child/mine` (self-service, même
pattern que `/me`/`/mine` ci-dessus) liste les enfants liés à l'appelant.

**Vérification fine — même pattern que le scope `TEAM`/`assertPlayerInTeam`.** `PermissionsGuard`
ne vérifie que "ce membre a-t-il un scope quelconque sur cette ressource dans ce club/équipe ?" —
jamais que l'enfant ciblé par l'URL est bien SON enfant. Chaque service concerné vérifie donc le
lien via un nouveau helper, `assertParentChildLink` (`backend/src/common/parent-child-membership.ts`),
calqué sur `assertPlayerInTeam`.

**Piège découvert en conception — le scope `PARENT` doit toujours rester un sur-ensemble strict du
scope `OWN`.** Un même membre peut cumuler un rôle Player et un rôle Parent sur le même contexte
club/équipe (ex. un Parent dont l'enfant lié joue dans la même équipe que lui-même, ou plus
simplement un membre déjà scopé Player qui devient aussi Parent d'un tiers dans cette équipe).
`PermissionsService.widestOf` ne résout qu'**un seul** scope par appel (`SCOPE_ORDER`, placé entre
`OWN` et `TEAM`) — si le scope résolu devient `PARENT` alors que l'appelant consulte **son propre**
profil, une vérification naïve de `assertParentChildLink` échouerait à tort (aucun lien
`ParentChild(soi, soi)` n'existe). Parade appliquée dans chaque service : la branche `PARENT` ne
déclenche `assertParentChildLink` que si la ressource ciblée n'est **pas** celle de l'appelant lui-même :
```ts
if (requester.scope === 'PARENT' && profile.memberId !== requester.memberId) {
  await assertParentChildLink(prisma, requester.memberId, profile.memberId, notFoundErrorCode);
}
```
Test de référence : `backend/src/common/parent-child-multi-role.integration.spec.ts` (persona
"Bob", Player ET Parent sur le même contexte, consulte son propre profil sans lien sur lui-même).

**Visibilité des notes/objectifs — plus restrictive que le scope `OWN` de l'enfant lui-même.** Le
modèle `NoteVisibility` (Privé/Semi-privé/Public) réservait déjà `SEMI_PRIVE` au joueur et au staff,
sans les parents (voir le commentaire au-dessus de `enum NoteVisibility`, `schema.prisma`) — une
décision RGPD antérieure à ce câblage, préservant une part d'autonomie de l'enfant face au staff.
Le scope `PARENT` respecte cette règle telle quelle : `PlayerNotesService`/`PlayerObjectivesService`
filtrent sur `visibility === 'PUBLIC'` uniquement pour ce scope, alors que l'enfant lui-même
(scope `OWN`) voit `SEMI_PRIVE` + `PUBLIC`.

**`isExcused` sur `PlayerAbsence`** : un Parent qui déclare une absence pour son enfant ne peut pas
plus s'auto-excuser que l'enfant lui-même (`requester.scope === 'OWN' || requester.scope ===
'PARENT'` force `isExcused` à `null`, seul un Coach/AdminClub peut le renseigner ensuite).

**Complément — self-service `/me` élargi.** Un membre auto-provisionné
(`resolveOrProvisionMember`) reçoit un nom placeholder dérivé de son email ; `UpdateMyMemberDto`
accepte désormais aussi `firstName`/`lastName`/`phone` (plus seulement `birthDate`) pour que
n'importe quel membre — un Parent en particulier, seule donnée fiable détenue par le système étant
son email — puisse le remplacer par ses vraies informations, essentielles pour que le staff
puisse le joindre.

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

**Implémentations concrètes de ce scénario** : `src/roles/permissions.service.spec.ts` le teste
au niveau abstrait de `PermissionsService.can()` (Phase 1). Pour le module Effectif (A8,
Phase 2), `backend/src/common/effectif-multi-role.integration.spec.ts` l'applique aux 5
ressources réelles (Mesures/Entretien/Notes/Objectifs/Évaluation) via les vrais guards/services
— un seul membre (Marc) cumulant Coach/Player/Parent dans des contextes distincts, à la
différence des `*-permissions.integration.spec.ts` de chaque module qui utilisent toujours un
utilisateur différent par rôle. Pour le module Calendrier (B9, Partie B),
`backend/src/common/calendrier-multi-role.integration.spec.ts` applique le même principe à
`Event`/`PlayerAbsence` (CRUD réel via guards/services) et aux agrégations "mine"
(`events/mine`, `members/birthdays`, exercées avec le vrai `PermissionsService` — voir le
constat documenté ci-dessus sur leur proxy `MemberRole`). Pour le module Season (A13/A19, Phase 3
Partie A — révisé en A14-A15 pour un `Season` club-wide, voir `docs/roadmap.md`),
`backend/src/common/season-multi-role.integration.spec.ts` couvre `SeasonsController` (un
persona AdminClub dédié crée/active une saison club-wide en flux réel — Marc, Coach/Player, n'a
plus que la lecture depuis la révision A14) et le filtrage rétroactif par saison des entités
A7.x (A12, via `PlayerObjectivesController` comme représentant des 4 ressources partageant
`resolveSeasonPeriod`) — dont le cas explicite d'un `seasonId` appartenant à un AUTRE **club**
(et non plus une autre équipe, `Season` n'ayant plus de FK vers `Team`) que celui transmis,
rejeté en 404 par `resolveSeasonPeriod` plutôt que de fuiter les bornes de dates d'une saison
hors scope. Pour le module Championship (B15, Phase 3 Partie B),
`backend/src/common/championship-multi-role.integration.spec.ts` couvre le flux réel complet
sur `championship`/`championship_participant`/`championship_match`/`external_team` : Marc-Coach
(équipe 5) crée une équipe adverse, un championnat, ses participants, planifie une rencontre,
saisit un résultat et lit le classement calculé (vérifie le classement lui-même, pas seulement
le guard) — refusé sur l'équipe 8 où il n'est que Player ; Marc-Player (équipe 8) lit
championnats/participants/rencontres/classement de sa propre équipe en lecture seule
(`canManage=false`), écriture refusée par le guard, et n'a **pas** accès à `external_team` (seul
Coach y a droit, aucun besoin de consulter le carnet d'adresses hors contexte d'un championnat) ;
Marc-Parent (Club B) n'a strictement aucun accès aux 4 ressources — contrairement à la
conception initiale de la Partie B qui envisageait un `READ TEAM` pour Parent au même titre que
Player, jamais câblé dans le seed final (voir `docs/modules/saisons-championnats.md`
§Droits par rôle). Pour les rôles plateforme (§Rôles plateforme ci-dessus, correctif transverse
post-Phase 3), `backend/src/common/platform-role-multi-role.integration.spec.ts` couvre un
persona "Alice" détenant un `UserRole` `Proprietaire` mais **aucune** fiche `Member` nulle part :
accès accordé (scope `ALL`) et `Member` provisionné à la volée sur deux clubs jamais visités,
plus un cas témoin (aucun `Member`, aucun `UserRole`) qui reste refusé.

### Propriétaire — mécanisme de transfert sécurisé

Rôle plateforme (§Rôles plateforme ci-dessus) : le "transfert" est une succession de leadership
de la plateforme elle-même (réassignation d'un `UserRole` `Proprietaire` d'un utilisateur à un
autre), pas un transfert de club. Doit passer par une procédure sécurisée (à détailler avant
implémentation) : validation par email, délai de confirmation, log d'audit irréversible. Item
encore reporté (Phase 9) — seul le grant initial via `backend/scripts/bootstrap-platform-role.ts`
est implémenté pour l'instant, pas de flux de transfert.

---

## Tests de permission — exigences minimales

Pour chaque module, une suite de tests doit couvrir :
1. Un utilisateur sans aucun rôle ne peut rien faire.
2. Chaque rôle système peut faire exactement ce qu'il doit faire (ni plus, ni moins).
3. Un rôle scopé équipe A ne peut pas accéder aux données de l'équipe B.
4. Un scénario multi-rôles (au moins un test du type "Marc" décrit ci-dessus).
5. Un rôle personnalisé avec permissions limitées respecte ces limites.
