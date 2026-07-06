import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { PlayerObjectivesController } from './player-objectives.controller';
import { PlayerObjectivesService } from './player-objectives.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [PlayerObjectivesController],
  providers: [PlayerObjectivesService],
})
export class PlayerObjectivesModule {}
