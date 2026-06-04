import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { CreateFieldDefinitionDto } from './dto/create-field-definition.dto';

@Injectable()
export class FieldDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByDepartment(departmentId: string) {
    await this.assertDepartment(departmentId);
    return this.prisma.fieldDefinition.findMany({
      where: { departmentId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(departmentId: string, dto: CreateFieldDefinitionDto) {
    await this.assertDepartment(departmentId);
    const key = dto.key.trim().toLowerCase().replace(/\s+/g, '_');
    const existing = await this.prisma.fieldDefinition.findUnique({
      where: { departmentId_key: { departmentId, key } },
    });
    if (existing) {
      throw new ConflictException('Field key already exists for this department');
    }
    return this.prisma.fieldDefinition.create({
      data: {
        departmentId,
        key,
        label: dto.label,
        type: dto.type,
        required: dto.required ?? false,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  private async assertDepartment(departmentId: string) {
    const { tenantId } = getTenantContext();
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, tenantId },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }
}
