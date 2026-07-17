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
import type { Member } from '@prisma/client';
import { CurrentMember } from '../auth/decorators/current-member.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateMatchDto } from './dto/create-match.dto';
import { FindMatchesQueryDto } from './dto/find-matches-query.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { MatchesService } from './matches.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @RequirePermission('match', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreateMatchDto,
  ) {
    return this.matchesService.create(clubId, teamId, dto);
  }

  @RequirePermission('match', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @CurrentMember() member: Member,
    @Query() query: FindMatchesQueryDto,
  ) {
    return this.matchesService.findAllByTeam(clubId, teamId, member.id, query);
  }

  @RequirePermission('match', 'READ')
  @Get(':id')
  findOne(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentMember() member: Member,
  ) {
    return this.matchesService.findOne(clubId, teamId, id, member.id);
  }

  @RequirePermission('match', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMatchDto,
  ) {
    return this.matchesService.update(clubId, teamId, id, dto);
  }

  @RequirePermission('match', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.matchesService.remove(clubId, teamId, id);
  }
}
