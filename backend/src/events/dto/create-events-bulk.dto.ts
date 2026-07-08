import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateEventDto } from './create-event.dto';

// Création d'une série d'événements récurrents (docs/roadmap.md) : le
// frontend calcule les dates d'occurrence (lib/recurrence.ts) et envoie la
// liste résolue en une seule requête — pas de nouvelle entité
// RecurringRule, chaque occurrence est un Event indépendant (isRecurring
// = true, aucun lien de groupe, voir EventsService.createBulk).
export class CreateEventsBulkDto {
  @ValidateNested({ each: true })
  @Type(() => CreateEventDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  events: CreateEventDto[];
}
