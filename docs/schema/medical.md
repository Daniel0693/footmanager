# Schéma — Médical (Blessures et Rééducation)

> Données de santé des joueurs — catégorie spéciale RGPD (Article 9).
> Accès strictement limité via le système de permissions granulaires (rôle `Physiotherapeute`
> ou équivalent). Voir `docs/decisions-ouvertes-et-rgpd.md`.
> Voir `docs/modules/blessures.md` pour la logique fonctionnelle complète.

---

## Injury — Blessure

Plusieurs `Injury` actives simultanément pour un même joueur sont supportées nativement.
Chaque blessure suit son propre cycle de rétablissement indépendant.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `playerId` | FK → PlayerProfile | |
| `nature` | enum `InjuryNature` | |
| `location` | enum `InjuryLocation` | |
| `severity` | enum `InjurySeverity` | |
| `occurredAt` | Date | date de survenue |
| `estimatedDowntimeDays` | Int, nullable | durée d'indisponibilité estimée |
| `cause` | String, nullable | ex. "entraînement", "accident hors terrain" |
| `status` | enum `InjuryStatus` | |
| `recoveredAt` | Date, nullable | |

**Intégration statut/calendrier** (légère) : tant qu'une `Injury` a le statut `EN_COURS`,
le joueur peut apparaître avec un indicateur "blessé" dans l'effectif et les convocations.
Quand toutes ses blessures actives passent à `RETABLI`, l'indicateur disparaît.

---

## InjuryAssignment — Intervenants sur une blessure

Plusieurs membres du staff peuvent suivre une même blessure (médecin, kiné, préparateur
physique, entraîneur) et contribuer au dossier via la plateforme.

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `injuryId` | FK → Injury | |
| `staffMemberId` | FK → Member | |
| `assignedAt` | Date, nullable | |

---

## InjuryRehabEvent — Étape de la timeline de rééducation

| Champ | Type | Notes |
|---|---|---|
| `id` | PK | |
| `injuryId` | FK → Injury | |
| `description` | Text | ex. "Reprise vélo 30 min", "Séance de physiothérapie" |
| `eventType` | enum `RehabEventType`, nullable | |
| `startDate` | Date | |
| `endDate` | Date, nullable | |
| `validatedById` | FK → Member, nullable | intervenant ayant validé l'étape |
| `observationComment` | Text, nullable | douleur résiduelle, progrès constatés |

La timeline est affichée en ordre chronologique depuis `occurredAt` jusqu'au retour à 100%.

---

## Enums

```prisma
enum InjuryNature {
  ENTORSE
  FRACTURE
  DECHIRURE_MUSCULAIRE
  CONTUSION
  LUXATION
  AUTRE
}

enum InjuryLocation {
  CHEVILLE
  GENOU
  POIGNET
  HANCHE
  EPAULE
  CUISSE
  MOLLET
  DOS
  AUTRE
}

enum InjurySeverity {
  LEGER
  MODERE
  GRAVE
}

enum InjuryStatus {
  EN_COURS
  RETABLI
}

enum RehabEventType {
  REPOS
  EXERCICE
  TEST_MEDICAL
}
```

---

## Index

```
@@index([playerId])           sur Injury
@@index([playerId, status])   sur Injury (trouver rapidement les blessures actives)
@@index([injuryId])           sur InjuryAssignment, InjuryRehabEvent
```

---

## Note RGPD — Données de santé (Article 9)

Les informations médicales constituent des données de santé soumises à des exigences renforcées
(RGPD Article 9) : consentement explicite requis, accès strictement limité au personnel
autorisé. L'accès à ce module doit passer par des permissions granulaires dédiées
(`injury READ/UPDATE TEAM` ou `CLUB`) — jamais incluses par défaut dans les rôles généraux.

Historique et prévention des rechutes : toutes les `Injury` (terminées ou en cours) sont
conservées. Un compteur par `(playerId, location)` permet d'identifier les fragilités
récurrentes (ex. 3 blessures à la cheville en 2 ans).
