import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ParentChildService } from './parent-child.service';

// Base distincte de ParentChildController (clubs/:clubId/players/:playerId/parents) :
// cette route agrège tous les enfants liés à l'appelant, elle ne peut donc
// pas porter de :playerId dans son URL naturelle (même raison que
// EventsMineController).
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/parent-child')
export class ParentChildMineController {
  constructor(private readonly parentChildService: ParentChildService) {}

  // Pas de @RequirePermission : pattern self-service /mine, voir
  // docs/modules/auth-roles.md §Patterns découverts.
  @Get('mine')
  findMine(
    @Param('clubId', ParseIntPipe) clubId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.parentChildService.findMineInClub(clubId, user.userId);
  }
}
