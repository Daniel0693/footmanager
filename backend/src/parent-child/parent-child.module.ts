import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { ParentChildMineController } from './parent-child-mine.controller';
import { ParentChildController } from './parent-child.controller';
import { ParentChildService } from './parent-child.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [ParentChildController, ParentChildMineController],
  providers: [ParentChildService],
})
export class ParentChildModule {}
