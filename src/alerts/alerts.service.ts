import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async getLowStockAlerts() {
    const { tenantId } = getTenantContext();

    const departments = await this.prisma.department.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });

    const alertItems: {
      id: string;
      name: string;
      sku: string | null;
      departmentId: string;
      departmentName: string;
      quantity: number;
      reorderLevel: number;
    }[] = [];

    for (const dept of departments) {
      const stock = await this.inventory.getDepartmentStock(dept.id);
      for (const item of stock) {
        const attrs = item.attributes as Record<string, unknown> | null;
        const reorderLevel = attrs?.reorder_level !== undefined
          ? Number(attrs.reorder_level)
          : null;
        if (reorderLevel !== null && !isNaN(reorderLevel) && item.quantity <= reorderLevel) {
          alertItems.push({
            id: item.id,
            name: item.name,
            sku: item.sku,
            departmentId: dept.id,
            departmentName: dept.name,
            quantity: item.quantity,
            reorderLevel,
          });
        }
      }
    }

    return { count: alertItems.length, items: alertItems };
  }
}
