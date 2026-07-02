import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { clubId: number; name: string }) {
    return this.prisma.team.create({ data });
  }

  findById(id: number) {
    return this.prisma.team.findUnique({ where: { id } });
  }
}
