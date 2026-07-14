import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [SeasonsController],
  providers: [SeasonsService],
})
export class SeasonsModule {}
