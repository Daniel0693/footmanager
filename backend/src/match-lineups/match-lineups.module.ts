import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { MatchLineupsController } from './match-lineups.controller';
import { MatchLineupsService } from './match-lineups.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [MatchLineupsController],
  providers: [MatchLineupsService],
})
export class MatchLineupsModule {}
