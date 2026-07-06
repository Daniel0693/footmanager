import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { PlayerMeasurementsController } from './player-measurements.controller';
import { PlayerMeasurementsService } from './player-measurements.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [PlayerMeasurementsController],
  providers: [PlayerMeasurementsService],
})
export class PlayerMeasurementsModule {}
