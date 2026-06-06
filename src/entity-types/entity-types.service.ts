import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { CreateEntityTypeDto } from './dto/create-entity-type.dto';
import { UpdateEntityTypeDto } from './dto/update-entity-type.dto';
import { CreateEntityFieldDto } from './dto/create-entity-field.dto';
import { UpsertWorkflowDto } from './dto/upsert-workflow.dto';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

const ENTITY_TYPE_INCLUDE = {
  fields: { orderBy: { sortOrder: 'asc' as const } },
  workflow: true,
  _count: { select: { records: true, fields: true } },
} as const;

@Injectable()
export class EntityTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    const { tenantId } = getTenantContext();
    return this.prisma.entityType.findMany({
      where: { tenantId },
      include: ENTITY_TYPE_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    const { tenantId } = getTenantContext();
    const et = await this.prisma.entityType.findFirst({
      where: { slug, tenantId },
      include: ENTITY_TYPE_INCLUDE,
    });
    if (!et) throw new NotFoundException(`Entity type "${slug}" not found`);
    return et;
  }

  async create(dto: CreateEntityTypeDto) {
    const { tenantId } = getTenantContext();
    const base = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    let slug = base || 'entity';
    let suffix = 1;
    while (await this.prisma.entityType.findFirst({ where: { tenantId, slug } })) {
      slug = `${base}-${suffix++}`;
    }
    return this.prisma.entityType.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        slug,
        description: dto.description,
        icon: dto.icon,
        roles: dto.roles ?? ['admin', 'manager'],
      },
      include: ENTITY_TYPE_INCLUDE,
    });
  }

  async update(slug: string, dto: UpdateEntityTypeDto) {
    const { tenantId } = getTenantContext();
    const et = await this.prisma.entityType.findFirst({ where: { slug, tenantId } });
    if (!et) throw new NotFoundException(`Entity type "${slug}" not found`);
    return this.prisma.entityType.update({
      where: { id: et.id },
      data: {
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.roles && { roles: dto.roles }),
      },
      include: ENTITY_TYPE_INCLUDE,
    });
  }

  async delete(slug: string) {
    const { tenantId } = getTenantContext();
    const et = await this.prisma.entityType.findFirst({ where: { slug, tenantId } });
    if (!et) throw new NotFoundException(`Entity type "${slug}" not found`);

    // Delete all related data in dependency order
    await this.prisma.$transaction([
      this.prisma.workflowEvent.deleteMany({
        where: { workflowInstance: { entityRecord: { entityTypeId: et.id } } },
      }),
      this.prisma.workflowInstance.deleteMany({
        where: { entityRecord: { entityTypeId: et.id } },
      }),
      this.prisma.entityRecord.deleteMany({ where: { entityTypeId: et.id } }),
      this.prisma.entityType.delete({ where: { id: et.id } }),
    ]);

    // Strip orphaned capabilities from all roles in this tenant
    const roles = await this.prisma.role.findMany({ where: { tenantId } });
    const capsToRemove = [`${slug}.view`, `${slug}.create`, `${slug}.delete`];
    for (const role of roles) {
      const caps = (role.capabilities as string[]).filter(
        (c) => !capsToRemove.includes(c),
      );
      if (caps.length !== (role.capabilities as string[]).length) {
        await this.prisma.role.update({
          where: { id: role.id },
          data: { capabilities: caps },
        });
      }
    }

    return { deleted: true };
  }

  async addField(slug: string, dto: CreateEntityFieldDto) {
    const { tenantId } = getTenantContext();
    const et = await this.prisma.entityType.findFirst({ where: { slug, tenantId } });
    if (!et) throw new NotFoundException(`Entity type "${slug}" not found`);

    const key = dto.key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const existing = await this.prisma.entityField.findFirst({
      where: { entityTypeId: et.id, key },
    });
    if (existing) throw new BadRequestException(`Field "${key}" already exists`);

    const count = await this.prisma.entityField.count({ where: { entityTypeId: et.id } });
    return this.prisma.entityField.create({
      data: {
        entityTypeId: et.id,
        key,
        label: dto.label,
        fieldType: dto.fieldType,
        required: dto.required ?? false,
        config: dto.config !== undefined ? (dto.config as Prisma.InputJsonValue) : undefined,
        sortOrder: dto.sortOrder ?? count,
      },
    });
  }

  async deleteField(slug: string, fieldId: string) {
    const { tenantId } = getTenantContext();
    const et = await this.prisma.entityType.findFirst({ where: { slug, tenantId } });
    if (!et) throw new NotFoundException(`Entity type "${slug}" not found`);
    const field = await this.prisma.entityField.findFirst({
      where: { id: fieldId, entityTypeId: et.id },
    });
    if (!field) throw new NotFoundException('Field not found');
    await this.prisma.entityField.delete({ where: { id: fieldId } });
    return { deleted: true };
  }

  async upsertWorkflow(slug: string, dto: UpsertWorkflowDto) {
    const { tenantId } = getTenantContext();
    const et = await this.prisma.entityType.findFirst({ where: { slug, tenantId } });
    if (!et) throw new NotFoundException(`Entity type "${slug}" not found`);

    const initialStates = dto.states.filter((s) => s.initial);
    if (initialStates.length !== 1) {
      throw new BadRequestException('Workflow must have exactly one initial state');
    }

    return this.prisma.workflowDefinition.upsert({
      where: { entityTypeId: et.id },
      create: {
        entityTypeId: et.id,
        states: dto.states as unknown as Prisma.InputJsonValue,
        transitions: dto.transitions as unknown as Prisma.InputJsonValue,
      },
      update: {
        states: dto.states as unknown as Prisma.InputJsonValue,
        transitions: dto.transitions as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
