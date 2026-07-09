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
import { FindMyEventsQueryDto } from './dto/find-my-events-query.dto';
import { EventsService } from './events.service';

// Base distincte de EventsController (clubs/:clubId/teams/:teamId/events) :
// cette route agrège plusieurs équipes, elle ne peut donc pas porter de
// :teamId dans son URL naturelle (voir EventsService.findMineInClub).
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/events')
export class EventsMineController {
  constructor(private readonly eventsService: EventsService) {}

  // Pas de PermissionsGuard/@RequirePermission ici : "mes événements" par
  // construction (voir EventsService.findMineInClub), même pattern que
  // TeamsController.findMine / PlayersController.findMe.
  @Get('mine')
  findMine(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentUser() user: { userId: number },
    @Query() query: FindMyEventsQueryDto,
  ) {
    return this.eventsService.findMineInClub(clubId, user.userId, query);
  }
}
