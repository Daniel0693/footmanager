import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';

@UseGuards(JwtAuthGuard)
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Post()
  create(@CurrentUser() user: { userId: number }, @Body() dto: CreateClubDto) {
    return this.clubsService.create(user.userId, dto);
  }

  // Pas de @RequirePermission : pattern self-service "mes clubs", voir
  // docs/modules/auth-roles.md §Patterns découverts.
  @Get()
  findMine(@CurrentUser() user: { userId: number }) {
    return this.clubsService.findAllForUser(user.userId);
  }
}
