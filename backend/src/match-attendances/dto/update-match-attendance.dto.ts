import { AttendanceStatus, ConvocationStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

// `convocationStatus` : modifiable par le Coach (n'importe quelle valeur) ou
// par le joueur/parent concerné (ACCEPTED/DECLINED seulement, jamais PENDING
// — vérifié dans le service, pas exprimable en décorateur puisque la règle
// dépend du scope de l'appelant). `attendanceStatus` : Coach/SuperAdmin
// uniquement, jamais le joueur/parent (même service).
export class UpdateMatchAttendanceDto {
  @IsOptional()
  @IsEnum(ConvocationStatus)
  convocationStatus?: ConvocationStatus;

  @IsOptional()
  @IsEnum(AttendanceStatus)
  attendanceStatus?: AttendanceStatus;
}
