import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { EvaluationConfigController } from './evaluation-config.controller';
import { EvaluationConfigService } from './evaluation-config.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [EvaluationConfigController],
  providers: [EvaluationConfigService],
})
export class EvaluationConfigModule {}
