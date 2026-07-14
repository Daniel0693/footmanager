import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { ChampionshipParticipantsController } from './championship-participants.controller';
import { ChampionshipParticipantsService } from './championship-participants.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [ChampionshipParticipantsController],
  providers: [ChampionshipParticipantsService],
})
export class ChampionshipParticipantsModule {}
