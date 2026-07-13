import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { SeasonRosterImportService } from './season-roster-import.service';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [SeasonsController],
  providers: [SeasonsService, SeasonRosterImportService],
})
export class SeasonsModule {}
