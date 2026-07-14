import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Member } from '@prisma/client';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ChampionshipParticipantsService } from './championship-participants.service';
import { CreateChampionshipParticipantDto } from './dto/create-championship-participant.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(
  'clubs/:clubId/teams/:teamId/championships/:championshipId/participants',
)
export class ChampionshipParticipantsController {
  constructor(
    private readonly championshipParticipantsService: ChampionshipParticipantsService,
  ) {}

  @RequirePermission('championship_participant', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('championshipId', ParseIntPipe) championshipId: number,
    @Body() dto: CreateChampionshipParticipantDto,
  ) {
    return this.championshipParticipantsService.create(
      clubId,
      teamId,
      championshipId,
      dto,
    );
  }

  @RequirePermission('championship_participant', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('championshipId', ParseIntPipe) championshipId: number,
    @CurrentMember() member: Member,
  ) {
    return this.championshipParticipantsService.findAllByChampionship(
      clubId,
      teamId,
      championshipId,
      member.id,
    );
  }

  @RequirePermission('championship_participant', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('championshipId', ParseIntPipe) championshipId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.championshipParticipantsService.remove(
      clubId,
      teamId,
      championshipId,
      id,
    );
  }
}
