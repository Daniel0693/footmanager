import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { ChampionshipMatchesController } from './championship-matches.controller';
import { ChampionshipMatchesService } from './championship-matches.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [ChampionshipMatchesController],
  providers: [ChampionshipMatchesService],
})
export class ChampionshipMatchesModule {}
