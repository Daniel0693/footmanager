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
import { ChampionshipMatchesService } from './championship-matches.service';
import { CreateChampionshipMatchDto } from './dto/create-championship-match.dto';
import { FindChampionshipMatchesQueryDto } from './dto/find-championship-matches-query.dto';
import { UpdateChampionshipMatchDto } from './dto/update-championship-match.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/championships/:championshipId/matches')
export class ChampionshipMatchesController {
  constructor(
    private readonly championshipMatchesService: ChampionshipMatchesService,
  ) {}

  @RequirePermission('championship_match', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('championshipId', ParseIntPipe) championshipId: number,
    @Body() dto: CreateChampionshipMatchDto,
  ) {
    return this.championshipMatchesService.create(
      clubId,
      teamId,
      championshipId,
      dto,
    );
  }

  @RequirePermission('championship_match', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('championshipId', ParseIntPipe) championshipId: number,
    @CurrentMember() member: Member,
    @Query() query: FindChampionshipMatchesQueryDto,
  ) {
    return this.championshipMatchesService.findAllByChampionship(
      clubId,
      teamId,
      championshipId,
      member.id,
      query,
    );
  }

  @RequirePermission('championship_match', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('championshipId', ParseIntPipe) championshipId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChampionshipMatchDto,
  ) {
    return this.championshipMatchesService.update(
      clubId,
      teamId,
      championshipId,
      id,
      dto,
    );
  }

  @RequirePermission('championship_match', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('championshipId', ParseIntPipe) championshipId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.championshipMatchesService.remove(
      clubId,
      teamId,
      championshipId,
      id,
    );
  }
}
