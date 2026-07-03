import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CreateMemberDto } from './dto/create-member.dto';
import { MembersService } from './members.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('clubs/:clubId/members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @RequirePermission('member', 'CREATE')
  @Post()
  create(
    @Param('clubId', ParseIntPipe) clubId: number,
    @Body() dto: CreateMemberDto,
  ) {
    return this.membersService.create({ clubId, ...dto });
  }
}
