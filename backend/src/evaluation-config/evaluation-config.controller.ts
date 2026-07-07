import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { EvaluationConfigService } from './evaluation-config.service';

// Cette route ne porte pas de teamId dans l'URL : un Coach ou un Player
// (rôles scopés TEAM sur `evaluation_config`) doivent le transmettre en
// query (`?teamId=`) pour être autorisés — voir docs/modules/auth-roles.md
// §"Patterns découverts". Le service lui-même n'utilise pas ce teamId : la
// configuration du radar est la même pour tout le club, seule la permission
// d'y accéder est scopée équipe.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/evaluation-config')
export class EvaluationConfigController {
  constructor(
    private readonly evaluationConfigService: EvaluationConfigService,
  ) {}

  @RequirePermission('evaluation_config', 'READ')
  @Get()
  findAll(@Param('clubId', ParseIntPipe) clubId: number) {
    return this.evaluationConfigService.findAllByClub(clubId);
  }
}
