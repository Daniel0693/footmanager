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

  // Pas de @RequirePermission : pattern self-service /mine, voir
  // docs/modules/auth-roles.md §Patterns découverts.
  @Get('mine')
  findMine(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentUser() user: { userId: number },
    @Query() query: FindMyEventsQueryDto,
  ) {
    return this.eventsService.findMineInClub(clubId, user.userId, query);
  }
}
