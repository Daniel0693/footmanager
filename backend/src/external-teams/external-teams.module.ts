import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { ExternalTeamsController } from './external-teams.controller';
import { ExternalTeamsService } from './external-teams.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [ExternalTeamsController],
  providers: [ExternalTeamsService],
})
export class ExternalTeamsModule {}
