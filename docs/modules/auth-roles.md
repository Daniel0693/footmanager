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
permission `event`/`member` correspondante (le rôle `Parent`, par exemple, s'il était un jour
rattaché à l'équipe de son enfant) verrait quand même le calendrier/les anniversaires de cette
équipe via `/mine`, uniquement parce que le `MemberRole` existe. Sans impact aujourd'hui (`Parent`
n'est pas câblé à un `MemberRole` équipe en pratique, décision ouverte #5) et cohérent avec le
comportement déjà établi de `TeamsService.findMineInClub` (Phase 3, antérieur au module
Calendrier) — décision de ne pas corriger maintenant, documentée plutôt que laissée implicite.
Si un rôle scopé équipe sans permission Calendrier apparaît un jour, revoir ce point avant de le
déployer.

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
hors scope.

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
