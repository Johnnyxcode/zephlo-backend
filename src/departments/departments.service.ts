import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { CreateDepartmentDto } from './dto/create-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    const { tenantId } = getTenantContext();
    return this.prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { items: true, fieldDefinitions: true } },
      },
    });
  }

  async findOne(id: string) {
    const { tenantId } = getTenantContext();
    const department = await this.prisma.department.findFirst({
      where: { id, tenantId },
      include: { fieldDefinitions: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }

  async create(dto: CreateDepartmentDto) {
    const { tenantId } = getTenantContext();
    const existing = await this.prisma.department.findFirst({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Department name already exists');
    }
    return this.prisma.department.create({
      data: { tenantId, name: dto.name, description: dto.description },
    });
  }
}
