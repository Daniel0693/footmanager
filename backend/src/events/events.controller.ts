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
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventsBulkDto } from './dto/create-events-bulk.dto';
import { FindEventsQueryDto } from './dto/find-events-query.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/teams/:teamId/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @RequirePermission('event', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreateEventDto,
  ) {
    return this.eventsService.create(clubId, teamId, dto);
  }

  // Doit être déclaré avant :id implicite des routes GET/PATCH/DELETE — pas
  // de conflit ici puisque seul POST porte cette route (:id n'existe que
  // sur PATCH/DELETE), mais on garde 'bulk' en chemin explicite plutôt que
  // ':id' pour éviter toute ambiguïté future.
  @RequirePermission('event', 'CREATE')
  @Post('bulk')
  createBulk(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Body() dto: CreateEventsBulkDto,
  ) {
    return this.eventsService.createBulk(clubId, teamId, dto.events);
  }

  @RequirePermission('event', 'READ')
  @Get()
  findAll(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Query() query: FindEventsQueryDto,
  ) {
    return this.eventsService.findAllByTeam(clubId, teamId, query);
  }

  // scope=future (docs/schema/evenements.md §Événements récurrents) : édite
  // aussi les occurrences suivantes du même lot récurrent. Query plutôt que
  // corps — c'est un modificateur de l'opération, pas une donnée de la
  // ressource ; 'single' par défaut si absent ou invalide (comportement
  // historique inchangé pour les appelants existants).
  @RequirePermission('event', 'UPDATE')
  @Patch(':id')
  update(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventDto,
    @Query('scope') scope?: string,
  ) {
    return this.eventsService.update(
      clubId,
      teamId,
      id,
      dto,
      scope === 'future' ? 'future' : 'single',
    );
  }

  @RequirePermission('event', 'DELETE')
  @Delete(':id')
  remove(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Param('teamId', ParseIntPipe) teamId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('scope') scope?: string,
  ) {
    return this.eventsService.remove(
      clubId,
      teamId,
      id,
      scope === 'future' ? 'future' : 'single',
    );
  }
}
