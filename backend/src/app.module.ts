import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ChampionshipMatchesModule } from './championship-matches/championship-matches.module';
import { ChampionshipParticipantsModule } from './championship-participants/championship-participants.module';
import { ChampionshipsModule } from './championships/championships.module';
import { ClubsModule } from './clubs/clubs.module';
import { EvaluationConfigModule } from './evaluation-config/evaluation-config.module';
import { EventsModule } from './events/events.module';
import { ExternalTeamsModule } from './external-teams/external-teams.module';
import { MatchAttendancesModule } from './match-attendances/match-attendances.module';
import { MatchLineupsModule } from './match-lineups/match-lineups.module';
import { MatchPeriodsModule } from './match-periods/match-periods.module';
import { MatchesModule } from './matches/matches.module';
import { MembersModule } from './members/members.module';
import { ParentChildModule } from './parent-child/parent-child.module';
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
    ParentChildModule,
    EvaluationConfigModule,
    EventsModule,
    SeasonsModule,
    ExternalTeamsModule,
    ChampionshipsModule,
    ChampionshipParticipantsModule,
    ChampionshipMatchesModule,
    MatchesModule,
    MatchAttendancesModule,
    MatchLineupsModule,
    MatchPeriodsModule,
  ],
})
export class AppModule {}
