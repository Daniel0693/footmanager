import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateTeamDto } from './dto/create-team.dto';
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

  @RequirePermission('team', 'READ')
  @Get(':id')
  findOne(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.teamsService.findByIdInClub(clubId, id);
  }
}
