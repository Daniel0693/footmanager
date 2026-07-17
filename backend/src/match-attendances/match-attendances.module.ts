import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { MatchAttendancesController } from './match-attendances.controller';
import { MatchAttendancesService } from './match-attendances.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [MatchAttendancesController],
  providers: [MatchAttendancesService],
})
export class MatchAttendancesModule {}
