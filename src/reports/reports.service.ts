import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  private async getStockByDepartment(tenantId: string) {
    const departments = await this.prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return Promise.all(
      departments.map(async (dept) => {
        const items = await this.inventory.getDepartmentStock(dept.id);
        const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
        const lowStock = items.filter((i) => {
          const reorder = (i.attributes as Record<string, unknown>)
            ?.reorder_level;
          return typeof reorder === 'number' && i.quantity <= reorder;
        });
        return {
          department: dept,
          itemCount: items.length,
          totalUnits,
          lowStockCount: lowStock.length,
          items,
        };
      }),
    );
  }

  async getOverview() {
    const { tenantId } = getTenantContext();

    const stockByDepartment = await this.getStockByDepartment(tenantId);

    const recentMovements = await this.prisma.inventoryMovement.findMany({
      where: { tenantId },
      include: {
        item: { select: { name: true, sku: true } },
        department: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const recentTransfers = await this.prisma.transferRequest.findMany({
      where: { tenantId },
      include: {
        fromDepartment: { select: { name: true } },
        toDepartment: { select: { name: true } },
        lines: { include: { item: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const events = await this.prisma.domainEvent.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    return {
      stockByDepartment,
      recentMovements,
      recentTransfers,
      events,
    };
  }

  async getAuditLog() {
    const { tenantId } = getTenantContext();

    const [movements, transfers, stockByDepartment] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where: { tenantId },
        include: {
          item: { select: { name: true, sku: true } },
          department: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.transferRequest.findMany({
        where: { tenantId },
        include: {
          fromDepartment: { select: { name: true } },
          toDepartment: { select: { name: true } },
          lines: { include: { item: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.getStockByDepartment(tenantId),
    ]);

    return { movements, transfers, stockByDepartment };
  }

  async exportCsv(): Promise<string> {
    const [{ stockByDepartment }, { movements, transfers }] = await Promise.all([
      this.getOverview(),
      this.getAuditLog(),
    ]);
    const lines: string[] = [];

    lines.push('ZEPHLO MOVEMENT REPORT');
    lines.push(`Generated,${new Date().toISOString()}`);
    lines.push('');

    lines.push('CURRENT STOCK BY DEPARTMENT');
    lines.push('Department,Item,SKU,Quantity');
    for (const row of stockByDepartment) {
      for (const item of row.items) {
        lines.push(
          [
            row.department.name,
            item.name,
            item.sku ?? '',
            item.quantity,
          ]
            .map(escapeCsv)
            .join(','),
        );
      }
    }
    lines.push('');

    lines.push('INVENTORY MOVEMENTS');
    lines.push(
      'Date,Department,Item,Change,Balance After,Type,By',
    );
    for (const m of movements) {
      lines.push(
        [
          m.createdAt.toISOString(),
          m.department.name,
          m.item.name,
          m.quantityDelta,
          m.balanceAfter,
          m.referenceType,
          m.createdByName ?? '',
        ]
          .map(escapeCsv)
          .join(','),
      );
    }
    lines.push('');

    lines.push('TRANSFERS');
    lines.push(
      'Date,From,To,Status,Items,Requested By,Approved By',
    );
    for (const t of transfers) {
      const itemSummary = t.lines
        .map((l) => `${l.item.name} x${l.quantity}`)
        .join('; ');
      lines.push(
        [
          t.createdAt.toISOString(),
          t.fromDepartment.name,
          t.toDepartment.name,
          t.status,
          itemSummary,
          t.requestedByName ?? '',
          t.approvedByName ?? '',
        ]
          .map(escapeCsv)
          .join(','),
      );
    }

    return lines.join('\n');
  }
}

function escapeCsv(value: unknown): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
