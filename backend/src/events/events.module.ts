import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.module';
import { RolesModule } from '../roles/roles.module';
import { EventsController } from './events.controller';
import { EventsMineController } from './events-mine.controller';
import { EventsService } from './events.service';

@Module({
  imports: [RolesModule, MembersModule],
  controllers: [EventsController, EventsMineController],
  providers: [EventsService],
})
export class EventsModule {}
