import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { PlayerTeamsController } from './player-teams.controller';
import { PlayerTeamsService } from './player-teams.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [PlayerTeamsController],
  providers: [PlayerTeamsService],
})
export class PlayerTeamsModule {}
