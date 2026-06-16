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
  // Page access
  view_overview: 'View dashboard & overview',
  view_stock: 'View department stock',
  view_transfers: 'View transfers',
  view_approvals: 'View approvals queue',
  view_purchase_orders: 'View purchase orders',
  view_reports: 'View reports & export',
  view_catalog: 'View product catalog',
  view_customers: 'View customers',
  view_sale_orders: 'View sale orders',
  view_invoices: 'View invoices',
  // Actions
  request_transfer: 'Request stock transfers',
  approve_transfer: 'Approve / reject transfers',
  create_po: 'Raise purchase orders',
  approve_po: 'Approve / reject purchase orders',
  receive_po: 'Mark PO as received',
  // Admin
  manage_config: 'Configure departments & fields',
  manage_entity_types: 'Manage entity types',
};

const DEFAULT_ROLES = [
  {
    name: 'Admin',
    slug: 'admin',
    color: 'purple',
    capabilities: [
      'view_overview', 'view_stock', 'view_transfers', 'view_approvals',
      'view_purchase_orders', 'view_reports', 'view_catalog', 'view_customers',
      'view_sale_orders', 'view_invoices',
      'request_transfer', 'approve_transfer',
      'create_po', 'approve_po', 'receive_po',
      'manage_config', 'manage_entity_types',
    ],
  },
  {
    name: 'Manager',
    slug: 'manager',
    color: 'blue',
    capabilities: [
      'view_overview', 'view_stock', 'view_transfers', 'view_approvals',
      'view_purchase_orders', 'view_reports', 'view_catalog', 'view_customers',
      'view_sale_orders', 'view_invoices',
      'request_transfer', 'approve_transfer', 'approve_po', 'receive_po',
    ],
  },
  {
    name: 'Staff',
    slug: 'staff',
    color: 'slate',
    capabilities: [
      'view_stock', 'view_transfers', 'view_catalog',
      'view_customers', 'view_sale_orders', 'view_invoices',
      'request_transfer',
    ],
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

    if (roles.length === 0) {
      // Lazy-seed defaults for tenants created before the roles feature existed
      await this.seedDefaults(tenantId);
    } else {
      // Merge any new capabilities into existing default roles without overwriting customisations
      await this.patchDefaultCapabilities(roles);
    }

    return this.prisma.role.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  private async patchDefaultCapabilities(roles: { id: string; slug: string; isDefault: boolean; capabilities: unknown }[]) {
    for (const def of DEFAULT_ROLES) {
      const existing = roles.find((r) => r.slug === def.slug && r.isDefault);
      if (!existing) continue;
      const current = new Set(existing.capabilities as string[]);
      const missing = def.capabilities.filter((c) => !current.has(c));
      if (missing.length === 0) continue;
      await this.prisma.role.update({
        where: { id: existing.id },
        data: { capabilities: [...current, ...missing] },
      });
    }
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
