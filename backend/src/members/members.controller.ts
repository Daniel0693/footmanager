import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateMemberDto } from './dto/create-member.dto';
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

  // "Mon profil" (docs/roadmap.md) : doit être déclaré avant ':id' (Nest
  // résout les routes dans l'ordre de déclaration, sinon 'me' serait capturé
  // par ':id'). Pas de @RequirePermission — MembersService.findMe/updateMe
  // résolvent le Member depuis le JWT, aucun scope RBAC à évaluer pour
  // éditer ses propres données (même pattern que PlayersController.findMe).
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
}
