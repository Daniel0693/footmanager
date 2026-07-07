import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { PlayerEvaluationsController } from './player-evaluations.controller';
import { PlayerEvaluationsService } from './player-evaluations.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [PlayerEvaluationsController],
  providers: [PlayerEvaluationsService],
})
export class PlayerEvaluationsModule {}
