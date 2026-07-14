import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ClubsModule } from './clubs/clubs.module';
import { EvaluationConfigModule } from './evaluation-config/evaluation-config.module';
import { EventsModule } from './events/events.module';
import { ExternalTeamsModule } from './external-teams/external-teams.module';
import { MembersModule } from './members/members.module';
import { PlayerEvaluationsModule } from './player-evaluations/player-evaluations.module';
import { PlayerInterviewsModule } from './player-interviews/player-interviews.module';
import { PlayerMeasurementsModule } from './player-measurements/player-measurements.module';
import { PlayerAbsencesModule } from './player-absences/player-absences.module';
import { PlayerNotesModule } from './player-notes/player-notes.module';
import { PlayerObjectivesModule } from './player-objectives/player-objectives.module';
import { PlayerTeamsModule } from './player-teams/player-teams.module';
import { PlayersModule } from './players/players.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { RosterModule } from './roster/roster.module';
import { SeasonsModule } from './seasons/seasons.module';
import { TeamStaffModule } from './team-staff/team-staff.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ClubsModule,
    TeamsModule,
    MembersModule,
    RolesModule,
    PlayersModule,
    PlayerTeamsModule,
    TeamStaffModule,
    RosterModule,
    PlayerMeasurementsModule,
    PlayerInterviewsModule,
    PlayerNotesModule,
    PlayerObjectivesModule,
    PlayerAbsencesModule,
    PlayerEvaluationsModule,
    EvaluationConfigModule,
    EventsModule,
    SeasonsModule,
    ExternalTeamsModule,
  ],
})
export class AppModule {}
