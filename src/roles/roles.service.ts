import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { CreateRoleDto } from './dto/create-role.dto';

export const SYSTEM_CAPABILITIES: Record<string, string> = {
  view_stock: 'View department stock',
  request_transfer: 'Request stock transfers',
  approve_transfer: 'Approve / reject transfers',
  create_po: 'Raise purchase orders',
  approve_po: 'Approve / reject purchase orders',
  receive_po: 'Mark PO as received',
  view_reports: 'View reports & export',
  manage_config: 'Configure departments & fields',
  manage_entity_types: 'Manage entity types',
};

const DEFAULT_ROLES = [
  {
    name: 'Admin',
    slug: 'admin',
    color: 'purple',
    capabilities: [
      'view_stock', 'request_transfer', 'approve_transfer',
      'create_po', 'approve_po', 'receive_po',
      'view_reports', 'manage_config', 'manage_entity_types',
    ],
  },
  {
    name: 'Manager',
    slug: 'manager',
    color: 'blue',
    capabilities: [
      'view_stock', 'request_transfer', 'approve_transfer',
      'approve_po', 'receive_po', 'view_reports',
    ],
  },
  {
    name: 'Staff',
    slug: 'staff',
    color: 'slate',
    capabilities: ['view_stock', 'request_transfer'],
  },
];

function toSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const { tenantId } = getTenantContext();
    let roles = await this.prisma.role.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    // Lazy-seed defaults for tenants created before the roles feature existed
    if (roles.length === 0) {
      await this.seedDefaults(tenantId);
      roles = await this.prisma.role.findMany({
        where: { tenantId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      });
    }

    return roles;
  }

  async create(dto: CreateRoleDto) {
    const { tenantId } = getTenantContext();
    const slug = toSlug(dto.name);

    const existing = await this.prisma.role.findUnique({
      where: { tenantId_slug: { tenantId, slug } },
    });
    if (existing) throw new ConflictException('A role with this name already exists');

    return this.prisma.role.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        slug,
        isDefault: false,
        capabilities: dto.capabilities ?? [],
        color: dto.color ?? 'slate',
      },
    });
  }

  async delete(id: string) {
    const { tenantId } = getTenantContext();
    const role = await this.prisma.role.findFirst({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isDefault) throw new BadRequestException('Default roles cannot be deleted');
    await this.prisma.role.delete({ where: { id } });
    return { deleted: true };
  }

  async getCapabilities() {
    const { tenantId } = getTenantContext();
    const entityTypes = await this.prisma.entityType.findMany({
      where: { tenantId },
      select: { slug: true, name: true },
      orderBy: { name: 'asc' },
    });

    const entityCaps: Record<string, string> = {};
    for (const et of entityTypes) {
      entityCaps[`${et.slug}.view`] = `${et.name} — View`;
      entityCaps[`${et.slug}.create`] = `${et.name} — Create`;
      entityCaps[`${et.slug}.delete`] = `${et.name} — Delete`;
    }

    return { system: SYSTEM_CAPABILITIES, entities: entityCaps };
  }

  async seedDefaults(tenantId: string) {
    for (const d of DEFAULT_ROLES) {
      await this.prisma.role.upsert({
        where: { tenantId_slug: { tenantId, slug: d.slug } },
        create: {
          tenantId,
          name: d.name,
          slug: d.slug,
          isDefault: true,
          capabilities: d.capabilities,
          color: d.color,
        },
        update: {},
      });
    }
  }
}
