import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { MatchPeriodsController } from './match-periods.controller';
import { MatchPeriodsService } from './match-periods.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [MatchPeriodsController],
  providers: [MatchPeriodsService],
})
export class MatchPeriodsModule {}
