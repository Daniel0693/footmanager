import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findSystemRoleByName(name: string) {
    return this.prisma.role.findFirst({ where: { name, isSystem: true, clubId: null } });
  }

  assignRole(data: { memberId: number; roleId: number; clubId?: number; teamId?: number }) {
    return this.prisma.memberRole.create({ data });
  }
}
