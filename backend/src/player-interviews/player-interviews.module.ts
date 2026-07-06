import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { PlayerInterviewsController } from './player-interviews.controller';
import { PlayerInterviewsService } from './player-interviews.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [PlayerInterviewsController],
  providers: [PlayerInterviewsService],
})
export class PlayerInterviewsModule {}
