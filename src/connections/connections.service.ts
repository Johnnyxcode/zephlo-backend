import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { CreateConnectionDto } from './dto/create-connection.dto';

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    const { tenantId } = getTenantContext();
    return this.prisma.departmentLink.findMany({
      where: { tenantId },
      include: {
        fromDepartment: { select: { id: true, name: true } },
        toDepartment: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateConnectionDto) {
    const { tenantId } = getTenantContext();

    if (dto.fromDepartmentId === dto.toDepartmentId) {
      throw new BadRequestException('Cannot connect a department to itself');
    }

    await this.assertDepartment(dto.fromDepartmentId, tenantId);
    await this.assertDepartment(dto.toDepartmentId, tenantId);

    const existing = await this.prisma.departmentLink.findUnique({
      where: {
        fromDepartmentId_toDepartmentId: {
          fromDepartmentId: dto.fromDepartmentId,
          toDepartmentId: dto.toDepartmentId,
        },
      },
    });
    if (existing) {
      throw new ConflictException('Connection already exists');
    }

    return this.prisma.departmentLink.create({
      data: {
        tenantId,
        fromDepartmentId: dto.fromDepartmentId,
        toDepartmentId: dto.toDepartmentId,
        requiresApproval: dto.requiresApproval ?? true,
      },
      include: {
        fromDepartment: { select: { id: true, name: true } },
        toDepartment: { select: { id: true, name: true } },
      },
    });
  }

  async delete(id: string) {
    const { tenantId } = getTenantContext();
    const connection = await this.prisma.departmentLink.findFirst({
      where: { id, tenantId },
    });
    if (!connection) throw new NotFoundException('Connection not found');
    await this.prisma.departmentLink.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertDepartment(id: string, tenantId: string) {
    const dept = await this.prisma.department.findFirst({
      where: { id, tenantId }, 
    });
    if (!dept) {
      throw new NotFoundException('Department not found');
    }
    return dept;
  }
}
