# Conventions TypeScript — Règles non négociables

> Objectif : zéro erreur `tsc` en permanence. Ces règles existent pour que les erreurs de
> typage soient détectées à l'écriture du code, pas en review ni en production.

---

## 1. Configuration — ne jamais assouplir

`backend/tsconfig.json` et `frontend/tsconfig.json` tournent avec `"strict": true` complet,
plus :

```jsonc
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
```

Seule dérogation volontaire : `"strictPropertyInitialization": false` côté backend. Les DTOs
(`class-validator`) et les entités n'initialisent jamais leurs propriétés en dur — elles sont
peuplées par le body parser / Prisma. Désactiver `strictPropertyInitialization` globalement est
la pratique standard NestJS ; ne pas le réactiver, et ne pas contourner l'absence d'initialiseur
avec `!` (definite assignment assertion) DTO par DTO.

**Toute PR qui modifie un de ces deux `tsconfig.json` pour retirer une option de `strict` ou une
option ci-dessus doit être justifiée explicitement dans la description de la PR.**

## 2. Commande à lancer avant tout commit

```bash
cd backend && npm run typecheck
cd frontend && npm run typecheck
```

Ces scripts (`tsc --noEmit`) doivent passer sans erreur. Pas de CI pour le MVP (voir
`docs/architecture.md` §6) : c'est donc une discipline manuelle, pas un filet de sécurité
automatique — à ne pas sauter.

## 3. Interdits explicites

- **`any` explicite** interdit (`@typescript-eslint/no-explicit-any` est désactivé dans
  `backend/eslint.config.mjs` pour compatibilité avec des libs tierces non typées, mais ça ne
  veut pas dire qu'on peut en écrire par confort — un `any` doit être un dernier recours documenté
  d'un commentaire expliquant pourquoi le type réel n'est pas exprimable).
- **`// @ts-ignore` / `// @ts-expect-error`** interdits sauf cas limite documenté (bug connu d'une
  dépendance, lien vers l'issue). Ne jamais l'utiliser pour faire taire une vraie erreur de typage.
- **Assertions non-null (`!`)** interdites sauf quand l'invariant est garanti par le code juste
  au-dessus (ex. après un guard `if (!x) throw ...`) — jamais pour contourner un `strictNullChecks`
  dont la vraie cause est un flux de données mal typé.
- **`as` de contournement** (`as unknown as X`, cast vers un type non related) interdit. Un cast
  légitime (ex. résultat JSON externe vers un type applicatif) doit rester un cast direct et
  documenté, jamais une double assertion pour faire taire le compilateur.

## 4. Typage des données Prisma — source unique de vérité

Ne jamais redéfinir manuellement un type qui correspond à un modèle Prisma. Toujours importer les
types générés (`import { User, Prisma } from '@prisma/client'`) plutôt que de dupliquer les champs
dans une interface maison — un champ ajouté/renommé dans `schema.prisma` doit casser la
compilation partout où il est utilisé, pas seulement là où le nouveau champ est lu.

Pour les formes partielles (résultat de `select`/`include`), utiliser les helpers Prisma
(`Prisma.UserGetPayload<...>`) plutôt qu'une interface écrite à la main qui divergera du schéma
réel au premier `select` modifié.

## 5. DTOs et validation (backend)

- Un DTO d'entrée API = une classe `class-validator` avec décorateurs, jamais une interface brute
  (l'interface ne valide rien à l'exécution — voir `docs/modules/auth-roles.md` pour la
  cohérence entre validation et permissions).
- Le type des réponses API doit correspondre au type réellement retourné par le service — pas de
  `Promise<any>` en signature de méthode de service/controller.

## 6. Erreurs applicatives — jamais de texte brut typé `string` en dur

Conformément à `docs/architecture.md` §3 (i18n), toute exception levée passe par
`AppException` (voir `backend/src/common/exceptions/`) avec un code, jamais un message
utilisateur en clair. Une méthode qui retourne un message d'erreur en `string` littéral codé en
dur doit être vue comme un signal d'alerte à la review.

## 7. Multi-rôles et permissions — rappel de cohérence de typage

Toute fonction qui évalue une permission doit prendre en paramètre un scope explicite
(`clubId`/`teamId`) typé, jamais un booléen `isAdmin` ou un rôle unique en paramètre — le typage
doit rendre impossible d'appeler la fonction de permission sans le contexte de scope. Voir la
Règle d'or dans `CLAUDE.md` et `docs/modules/auth-roles.md`.

## 8. Frontend — pas de `any` aux frontières API

Les réponses de `apiFetch` (`frontend/src/lib/api.ts`) doivent être typées au point d'appel
(générique explicite ou type de retour du hook), jamais laissées en `any` implicite via
`response.json()` non typé.

## 9. Avant toute modification structurelle

Si une modification change une signature partagée (type exporté, DTO, modèle Prisma), relancer
`npm run typecheck` sur **les deux** paquets (`backend` et `frontend`) avant de considérer la
tâche terminée — un changement de type backend peut casser la compilation frontend si des types
sont partagés ou dupliqués manuellement (voir règle §4 : c'est justement ce que la règle "types
Prisma = source unique" cherche à éviter côté back ; côté front-back, garder les types de réponse
API alignés à la main tant qu'il n'y a pas de génération automatique de client).
