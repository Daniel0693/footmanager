import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { RosterController } from './roster.controller';
import { RosterService } from './roster.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [RosterController],
  providers: [RosterService],
})
export class RosterModule {}
