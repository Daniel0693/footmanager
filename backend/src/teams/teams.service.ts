import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../roles/permissions.service';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membersService: MembersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  create(data: { clubId: number; name: string }) {
    return this.prisma.team.create({ data });
  }

  async update(clubId: number, id: number, dto: UpdateTeamDto) {
    await this.findByIdInClub(clubId, id);
    return this.prisma.team.update({ where: { id }, data: { name: dto.name } });
  }

  // Suppression bloquée dès que l'équipe n'est plus "vide" (au moins un
  // membre affecté, un joueur, un événement ou un championnat) — même
  // esprit que le blocage de suppression d'une Season non-DRAFT
  // (SeasonsService) : une équipe fraîchement créée (ex. erreur de frappe)
  // reste supprimable sans confirmation compliquée, mais toute équipe déjà
  // utilisée nécessite une décision volontaire côté produit, pas encore
  // conçue (cascade/réaffectation) — 409 explicite plutôt qu'une erreur de
  // contrainte de clé étrangère brute renvoyée par Postgres.
  async remove(clubId: number, id: number) {
    await this.findByIdInClub(clubId, id);

    const [memberRoles, playerTeams, teamStaffs, championships, events] =
      await Promise.all([
        this.prisma.memberRole.count({ where: { teamId: id } }),
        this.prisma.playerTeam.count({ where: { teamId: id } }),
        this.prisma.teamStaff.count({ where: { teamId: id } }),
        this.prisma.championship.count({ where: { teamId: id } }),
        this.prisma.event.count({ where: { teamId: id } }),
      ]);
    if (memberRoles + playerTeams + teamStaffs + championships + events > 0) {
      throw new AppException(
        'TEAMS.CANNOT_DELETE_NOT_EMPTY',
        HttpStatus.CONFLICT,
      );
    }

    await this.prisma.team.delete({ where: { id } });
  }

  findById(id: number) {
    return this.prisma.team.findUnique({ where: { id } });
  }

  async findByIdInClub(clubId: number, id: number) {
    const team = await this.prisma.team.findFirst({ where: { id, clubId } });
    if (!team) {
      throw new AppException('TEAMS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return team;
  }

  findAllByClub(clubId: number) {
    return this.prisma.team.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * "Mes équipes" : contourne volontairement PermissionsGuard. Un rôle
   * scopé TEAM (Coach) ne peut jamais faire correspondre son MemberRole via
   * le guard générique sur cette route — elle liste justement les équipes,
   * donc ne porte pas de :teamId dans l'URL (même limite structurelle que
   * /players/me, voir PlayersService.findMe). Ici on distingue nous-mêmes :
   * un scope club-wide (CLUB/ALL, MemberRole.teamId=null) voit tout le
   * club ; sinon, on retombe sur les équipes où le membre a un MemberRole
   * scopé équipe — visible pour lui par construction, sans consulter le
   * système RBAC générique.
   *
   * `canManage` (créer/modifier/supprimer une équipe) reflète `team UPDATE`
   * — réservé à AdminClub+ dans le seed, un Coach n'y a jamais droit même
   * pour sa propre équipe (gestion structurelle du club, pas de l'effectif)
   * — jamais déduit d'un rôle côté client (règle CLAUDE.md).
   *
   * `readScope` (B21, retour utilisateur) — le scope brut derrière
   * `clubWideScope` ci-dessous (`CLUB`/`ALL`/`null`), exposé pour que la nav
   * "Effectif" (`SidebarNav`) sache quelle variante afficher : `ALL`
   * (SuperAdmin/Proprietaire) → bouton "Club" vers la liste des clubs ;
   * `CLUB` (AdminClub) → bouton "Équipes" vers le tableau des équipes ;
   * `null` (Coach/Player, scope TEAM sur au moins une équipe, ou aucun accès)
   * → bouton "Effectif" directement vers son équipe (`data[0]`, résolu par
   * le frontend). Jamais `'TEAM'` littéralement : ce `can()` est appelé sans
   * `teamId` dans le contexte, donc un scope TEAM ne matche structurellement
   * jamais ici (voir `matchesContext`) — seul `CLUB`/`ALL` peuvent ressortir.
   */
  async findMineInClub(clubId: number, userId: number) {
    const member = await this.membersService.resolveOrProvisionMember(
      userId,
      clubId,
    );

    const clubWideScope = await this.permissionsService.canEffective(
      userId,
      member.id,
      'READ',
      'team',
      { clubId },
    );
    const canManage = !!(await this.permissionsService.canEffective(
      userId,
      member.id,
      'UPDATE',
      'team',
      { clubId },
    ));

    const data = clubWideScope
      ? await this.findAllByClub(clubId)
      : await this.prisma.team.findMany({
          where: {
            clubId,
            memberRoles: {
              some: { memberId: member.id, teamId: { not: null } },
            },
          },
          orderBy: { name: 'asc' },
        });

    return { data, canManage, readScope: clubWideScope };
  }
}
