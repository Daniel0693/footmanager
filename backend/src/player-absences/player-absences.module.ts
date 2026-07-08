import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { PlayerAbsencesController } from './player-absences.controller';
import { PlayerAbsencesService } from './player-absences.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [PlayerAbsencesController],
  providers: [PlayerAbsencesService],
})
export class PlayerAbsencesModule {}
