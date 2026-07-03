import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/exceptions/app.exception';
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

  async findByIdInClub(clubId: number, id: number) {
    const team = await this.prisma.team.findFirst({ where: { id, clubId } });
    if (!team) {
      throw new AppException('TEAMS.NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return team;
  }

  findAllByClub(clubId: number) {
    return this.prisma.team.findMany({
      where: { clubId },
      orderBy: { name: 'asc' },
    });
  }
}
