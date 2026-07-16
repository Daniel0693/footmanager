import { Gender, TeamStaffRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

// Deux façons d'ajouter un membre du staff (validées par le service, pas
// ici — class-validator ne fait pas bien les schémas "l'un ou l'autre") :
// `memberId` (membre déjà existant dans le club, ex. un Parent qui devient
// aussi Adjoint) OU `firstName`+`lastName` (nouvelle personne — seul cas
// couvert par le frontend en v1, voir docs/modules/effectif-joueurs.md
// §B5.5). Dans ce second cas, le Member est créé dans la même transaction
// que le TeamStaff/MemberRole — jamais en deux appels distincts, pour ne
// jamais risquer un Member orphelin (créé mais jamais rattaché à une
// équipe) si le second appel échouait.
export class CreateTeamStaffDto {
  @IsOptional()
  @IsInt()
  memberId?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;

  @IsEnum(TeamStaffRole)
  staffRole: TeamStaffRole;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;
}
