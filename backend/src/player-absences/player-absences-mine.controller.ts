import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { FindMyAbsencesQueryDto } from './dto/find-my-absences-query.dto';
import { PlayerAbsencesService } from './player-absences.service';

// Base distincte de PlayerAbsencesController (clubs/:clubId/players/:playerId/
// absences) : cette route agrège plusieurs joueurs/équipes, elle ne peut donc
// pas porter de :playerId dans son URL naturelle (voir PlayerAbsencesService.
// findMineInClub) — même pattern que EventsMineController.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/absences')
export class PlayerAbsencesMineController {
  constructor(private readonly playerAbsencesService: PlayerAbsencesService) {}

  // Pas de PermissionsGuard/@RequirePermission ici : agrégation par
  // construction (voir PlayerAbsencesService.findMineInClub), même pattern
  // que EventsMineController.findMine / MembersController.findBirthdays.
  @Get('mine')
  findMine(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentUser() user: { userId: number },
    @Query() query: FindMyAbsencesQueryDto,
  ) {
    return this.playerAbsencesService.findMineInClub(
      clubId,
      user.userId,
      { dateFrom: query.dateFrom, dateTo: query.dateTo },
      query.teamIds,
    );
  }
}
