import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { ChampionshipsController } from './championships.controller';
import { ChampionshipsService } from './championships.service';
import { ClubChampionshipsController } from './club-championships.controller';
import { SeasonChampionshipsController } from './season-championships.controller';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [
    ChampionshipsController,
    SeasonChampionshipsController,
    ClubChampionshipsController,
  ],
  providers: [ChampionshipsService],
})
export class ChampionshipsModule {}
