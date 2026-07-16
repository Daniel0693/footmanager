import { HttpStatus, Injectable } from '@nestjs/common';
import type { PermissionScope, Position, Prisma } from '@prisma/client';
import { AppException } from '../common/exceptions/app.exception';
import { assertTeamInClub } from '../common/team-club-membership';
import { PrismaService } from '../prisma/prisma.service';

export type PlayerMatchStatus =
  'NEW' | 'MODIFICATION' | 'REACTIVATION' | 'AMBIGUOUS';

export interface PlayerMatchIdentity {
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  licenseNumber: string | null;
}

export interface PlayerMatchAssignment {
  id: number;
  jerseyNumber: number | null;
  mainPosition: Position | null;
  secondaryPositions: Position[];
}

export interface PlayerMatchCandidate {
  playerId: number;
  memberId: number;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  licenseNumber: string | null;
  // Affectation active dans l'équipe ciblée (leaveDate null) — présente
  // uniquement pour un statut MODIFICATION.
  activeAssignmentInTeam: PlayerMatchAssignment | null;
  // Affectation la plus récente (active ou non) dans l'équipe ciblée, même
  // quand `activeAssignmentInTeam` est absent — sert à préremplir la
  // réactivation "retour dans la même équipe" (docs/decisions-ouvertes-et-rgpd.md).
  lastAssignmentInTeam: PlayerMatchAssignment | null;
  // Équipes du même club où ce candidat a une affectation active AUTRE que
  // l'équipe ciblée — sert à afficher "actuellement dans l'équipe X", même
  // information que le sélecteur "Joueur existant du club" existant (A18).
  activeTeamsElsewhere: { teamId: number; teamName: string }[];
}

export interface PlayerMatchResult {
  status: PlayerMatchStatus;
  candidates: PlayerMatchCandidate[];
}

const matchInclude = {
  member: true,
  playerTeams: { include: { team: true } },
} satisfies Prisma.PlayerProfileInclude;

type ProfileWithRelations = Prisma.PlayerProfileGetPayload<{
  include: typeof matchInclude;
}>;
type AssignmentWithTeam = ProfileWithRelations['playerTeams'][number];

/**
 * Rapprochement joueur (import fichier + création manuelle) — cascade
 * intra-club uniquement pour l'instant : licence exacte, puis repli
 * nom+prénom+date de naissance. L'email est volontairement exclu (réservé au
 * futur mécanisme de réactivation inter-club, voir
 * docs/decisions-ouvertes-et-rgpd.md décision ouverte #7). Jamais de
 * recherche hors du club ciblé — voir docs/schema/joueurs.md §PlayerProfile.
 */
@Injectable()
export class RosterMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async findMatches(
    clubId: number,
    teamId: number,
    identity: PlayerMatchIdentity,
    requesterScope: PermissionScope,
  ): Promise<PlayerMatchResult> {
    // PermissionsGuard ne vérifie que "ce membre a-t-il un scope quelconque
    // sur player_profile READ ?" — un Player (scope OWN) ou un Parent (scope
    // PARENT) en dispose légitimement pour consulter SA propre fiche/celle de
    // son enfant, mais n'a aucun cas d'usage pour rechercher un joueur
    // quelconque du club par nom/licence (outil de gestion d'effectif,
    // réservé au staff) — filtrage fin laissé au service, comme partout
    // ailleurs (docs/modules/auth-roles.md).
    if (requesterScope === 'OWN' || requesterScope === 'PARENT') {
      throw new AppException('AUTH.FORBIDDEN', HttpStatus.FORBIDDEN);
    }

    await assertTeamInClub(
      this.prisma,
      clubId,
      teamId,
      'ROSTER.TEAM_NOT_IN_CLUB',
    );

    const profiles = await this.findCandidateProfiles(clubId, identity);

    if (profiles.length === 0) {
      return { status: 'NEW', candidates: [] };
    }

    const candidates = profiles.map((profile) =>
      this.toCandidate(profile, teamId),
    );

    if (candidates.length > 1) {
      return { status: 'AMBIGUOUS', candidates };
    }

    const [candidate] = candidates;
    return {
      status: candidate.activeAssignmentInTeam
        ? 'MODIFICATION'
        : 'REACTIVATION',
      candidates,
    };
  }

  private async findCandidateProfiles(
    clubId: number,
    identity: PlayerMatchIdentity,
  ): Promise<ProfileWithRelations[]> {
    if (identity.licenseNumber) {
      const byLicense = await this.prisma.playerProfile.findMany({
        where: { licenseNumber: identity.licenseNumber, member: { clubId } },
        include: matchInclude,
      });
      if (byLicense.length > 0) {
        return byLicense;
      }
    }

    if (!identity.birthDate) {
      // Sans date de naissance, le repli nom+prénom seul est trop peu
      // fiable (trop de faux positifs) — on ne matche pas.
      return [];
    }

    return this.prisma.playerProfile.findMany({
      where: {
        member: {
          clubId,
          firstName: { equals: identity.firstName, mode: 'insensitive' },
          lastName: { equals: identity.lastName, mode: 'insensitive' },
          birthDate: identity.birthDate,
        },
      },
      include: matchInclude,
    });
  }

  private toCandidate(
    profile: ProfileWithRelations,
    teamId: number,
  ): PlayerMatchCandidate {
    const inTargetTeam = [...profile.playerTeams]
      .filter((assignment) => assignment.teamId === teamId)
      .sort((a, b) => this.compareByRecency(a, b));
    const active = inTargetTeam.find(
      (assignment) => assignment.leaveDate === null,
    );
    const mostRecent = inTargetTeam[0];

    const elsewhere = profile.playerTeams.filter(
      (assignment) =>
        assignment.teamId !== teamId && assignment.leaveDate === null,
    );

    return {
      playerId: profile.id,
      memberId: profile.memberId,
      firstName: profile.member.firstName,
      lastName: profile.member.lastName,
      birthDate: profile.member.birthDate,
      licenseNumber: profile.licenseNumber,
      activeAssignmentInTeam: active ? this.toAssignment(active) : null,
      lastAssignmentInTeam: mostRecent ? this.toAssignment(mostRecent) : null,
      activeTeamsElsewhere: elsewhere.map((assignment) => ({
        teamId: assignment.teamId,
        teamName: assignment.team.name,
      })),
    };
  }

  private toAssignment(assignment: AssignmentWithTeam): PlayerMatchAssignment {
    return {
      id: assignment.id,
      jerseyNumber: assignment.jerseyNumber,
      mainPosition: assignment.mainPosition,
      secondaryPositions: assignment.secondaryPositions,
    };
  }

  // Le plus récent d'abord : une affectation active prime toujours sur une
  // affectation archivée, sinon la date d'arrivée la plus tardive gagne.
  private compareByRecency(
    a: AssignmentWithTeam,
    b: AssignmentWithTeam,
  ): number {
    if ((a.leaveDate === null) !== (b.leaveDate === null)) {
      return a.leaveDate === null ? -1 : 1;
    }
    const aTime = a.joinDate?.getTime() ?? 0;
    const bTime = b.joinDate?.getTime() ?? 0;
    return bTime - aTime;
  }
}
