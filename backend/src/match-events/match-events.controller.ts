import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Member } from '@prisma/client';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { UpdateMatchEventDto } from './dto/update-match-event.dto';
import { MatchEventsService } from './match-events.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/matches/:matchId/events')
export class MatchEventsController {
  constructor(private readonly matchEventsService: MatchEventsService) {}

  @RequirePermission('match_event', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: CreateMatchEventDto,
  ) {
    return this.matchEventsService.create(clubId, teamId, matchId, dto);
  }

  @RequirePermission('match_event', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @CurrentMember() member: Member,
  ) {
    return this.matchEventsService.findAllByMatch(
      clubId,
      teamId,
      matchId,
      member.id,
    );
  }

  @RequirePermission('match_event', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMatchEventDto,
  ) {
    return this.matchEventsService.update(clubId, teamId, matchId, id, dto);
  }

  @RequirePermission('match_event', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.matchEventsService.remove(clubId, teamId, matchId, id);
  }
}
