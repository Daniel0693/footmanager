import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateMemberDto } from './dto/create-member.dto';
import { FindBirthdaysQueryDto } from './dto/find-birthdays-query.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateMyMemberDto } from './dto/update-my-member.dto';
import { MembersService } from './members.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @RequirePermission('member', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreateMemberDto,
  ) {
    return this.membersService.create({ clubId, ...dto });
  }

  // Pas de @RequirePermission : pattern self-service /me, voir
  // docs/modules/auth-roles.md §Patterns découverts. Déclaré avant `:id`
  // pour que 'me' ne soit pas capturé comme un id numérique.
  @Get('me')
  findMe(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.membersService.findMe(clubId, user.userId);
  }

  @Patch('me')
  updateMe(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateMyMemberDto,
  ) {
    return this.membersService.updateMe(clubId, user.userId, dto);
  }

  // Anniversaires visibles par l'appelant (docs/modules/calendrier-evenements.md
  // §Anniversaires) : même raison de contournement que 'me' ci-dessus — un
  // Coach peut couvrir plusieurs équipes, cette route sans teamId ne pourrait
  // jamais matcher un scope TEAM via PermissionsGuard. Le scope club/équipe
  // est résolu manuellement dans MembersService.findBirthdaysInClub.
  @Get('birthdays')
  findBirthdays(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentUser() user: { userId: number },
    @Query() query: FindBirthdaysQueryDto,
  ) {
    return this.membersService.findBirthdaysInClub(
      clubId,
      user.userId,
      { dateFrom: query.dateFrom, dateTo: query.dateTo },
      query.teamIds,
    );
  }

  // Cette route ne porte pas de teamId dans l'URL : un Coach (rôle scopé
  // TEAM, permission `member UPDATE TEAM` du seed) ne peut donc être
  // autorisé que si l'appelant transmet `?teamId=` en query — PermissionsGuard
  // résout déjà clubId/teamId depuis params, body OU query (voir
  // docs/modules/auth-roles.md — "Patterns découverts"). Le frontend doit
  // systématiquement passer ce paramètre pour toute édition faite depuis un
  // contexte équipe (fiche joueur, effectif).
  @RequirePermission('member', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.membersService.update(clubId, id, dto);
  }

  // Suppression RGPD en cascade (docs/decisions-ouvertes-et-rgpd.md) : ne
  // supprime jamais le User (identifiants de connexion), uniquement ce
  // Member et ses données scopées à ce club. Réservé à AdminClub/
  // SuperAdmin/Proprietaire — `member DELETE` n'est pas accordé au Coach
  // dans le seed (qui garde le droit d'archiver, pas de supprimer
  // définitivement).
  @RequirePermission('member', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RemoveMemberDto,
  ) {
    return this.membersService.remove(clubId, id, {
      forceAnonymize: dto.forceAnonymize,
    });
  }
}
