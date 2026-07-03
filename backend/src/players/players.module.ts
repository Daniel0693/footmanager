import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [PlayersController],
  providers: [PlayersService],
})
export class PlayersModule {}
