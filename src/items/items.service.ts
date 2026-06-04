import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { InventoryService } from '../inventory/inventory.service';
import { BulkImportItemsDto } from './dto/bulk-import-items.dto';
import { CreateItemDto } from './dto/create-item.dto';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async findByDepartment(departmentId: string) {
    await this.assertDepartment(departmentId);
    return this.inventory.getDepartmentStock(departmentId);
  }

  async create(departmentId: string, dto: CreateItemDto) {
    const { tenantId } = getTenantContext();
    await this.assertDepartment(departmentId);

    const item = await this.prisma.item.create({
      data: {
        departmentId,
        name: dto.name,
        sku: dto.sku,
        attributes: (dto.attributes ?? {}) as Prisma.InputJsonValue,
      },
    });

    const qty = dto.initialQuantity ?? 0;
    if (qty > 0) {
      await this.inventory.recordMovement({
        tenantId,
        departmentId,
        itemId: item.id,
        quantityDelta: qty,
        referenceType: 'INITIAL',
        createdByName: 'Admin',
      });
    }

    return {
      ...item,
      quantity: await this.inventory.getBalance(item.id, departmentId),
    };
  }

  async bulkImport(departmentId: string, dto: BulkImportItemsDto) {
    const { tenantId } = getTenantContext();
    await this.assertDepartment(departmentId);

    const created = [];
    for (const row of dto.items) {
      const item = await this.create(departmentId, {
        name: row.name,
        sku: row.sku,
        attributes: row.attributes,
        initialQuantity: row.quantity ?? 0,
      });
      created.push(item);
    }

    await this.prisma.domainEvent.create({
      data: {
        tenantId,
        type: 'items.imported',
        actorName: 'Administrator',
        payload: { departmentId, count: created.length },
      },
    });

    return { imported: created.length, items: created };
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
