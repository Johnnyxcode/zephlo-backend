import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { CreateTenantDto } from './dto/create-tenant.dto';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto) {
    const base = slugify(dto.name) || 'business';
    let slug = base;
    let suffix = 1;

    while (await this.prisma.tenant.findUnique({ where: { slug } })) {
      slug = `${base}-${suffix++}`;
    }

    const tenant = await this.prisma.tenant.create({
      data: { name: dto.name.trim(), slug },
    });

    await this.prisma.domainEvent.create({
      data: {
        tenantId: tenant.id,
        type: 'tenant.created',
        actorName: 'Administrator',
        payload: { name: tenant.name },
      },
    });

    return tenant;
  }

  getCurrent() {
    const { tenantId, tenantSlug } = getTenantContext();
    return this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: {
        _count: {
          select: { departments: true, users: true },
        },
      },
    }).then((tenant) => ({
      ...tenant,
      slug: tenantSlug,
    }));
  }

  async resetCurrent() {
    const { tenantId } = getTenantContext();

    await this.prisma.$transaction([
      this.prisma.domainEvent.deleteMany({ where: { tenantId } }),
      this.prisma.pOLine.deleteMany({ where: { purchaseOrder: { tenantId } } }),
      this.prisma.purchaseOrder.deleteMany({ where: { tenantId } }),
      this.prisma.transferLine.deleteMany({
        where: { transferRequest: { tenantId } },
      }),
      this.prisma.transferRequest.deleteMany({ where: { tenantId } }),
      this.prisma.inventoryMovement.deleteMany({ where: { tenantId } }),
      this.prisma.item.deleteMany({
        where: { department: { tenantId } },
      }),
      this.prisma.fieldDefinition.deleteMany({
        where: { department: { tenantId } },
      }),
      this.prisma.departmentLink.deleteMany({ where: { tenantId } }),
      this.prisma.supplier.deleteMany({ where: { tenantId } }),
      this.prisma.user.deleteMany({ where: { tenantId } }),
      this.prisma.department.deleteMany({ where: { tenantId } }),
    ]);

    return { reset: true, tenantId };
  }
}
