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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @RequirePermission('team', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamsService.create({ clubId, name: dto.name });
  }

  @RequirePermission('team', 'READ')
  @Get()
  findAll(@Param('clubId', ParseIntPipe) clubId: number) {
    return this.teamsService.findAllByClub(clubId);
  }

  // Pas de @RequirePermission ici : "mes équipes" par construction (voir
  // TeamsService.findMineInClub). Doit être déclaré avant `:id` pour que
  // 'mine' ne soit pas capturé comme un id numérique.
  @Get('mine')
  findMine(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.teamsService.findMineInClub(clubId, user.userId);
  }

  @RequirePermission('team', 'READ')
  @Get(':id')
  findOne(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.teamsService.findByIdInClub(clubId, id);
  }

  @RequirePermission('team', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(clubId, id, dto);
  }

  @RequirePermission('team', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.teamsService.remove(clubId, id);
  }
}
