import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { PlayerNotesController } from './player-notes.controller';
import { PlayerNotesService } from './player-notes.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [PlayerNotesController],
  providers: [PlayerNotesService],
})
export class PlayerNotesModule {}
