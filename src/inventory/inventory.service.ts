import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(itemId: string, departmentId: string): Promise<number> {
    const latest = await this.prisma.inventoryMovement.findFirst({
      where: { itemId, departmentId },
      orderBy: { createdAt: 'desc' },
    });
    return latest?.balanceAfter ?? 0;
  }

  async recordMovement(params: {
    tenantId: string;
    departmentId: string;
    itemId: string;
    quantityDelta: number;
    referenceType: string;
    referenceId?: string;
    createdByName?: string;
  }) {
    const current = await this.getBalance(
      params.itemId,
      params.departmentId,
    );
    const balanceAfter = current + params.quantityDelta;

    if (balanceAfter < 0) {
      throw new BadRequestException('Insufficient stock');
    }

    return this.prisma.inventoryMovement.create({
      data: {
        tenantId: params.tenantId,
        departmentId: params.departmentId,
        itemId: params.itemId,
        quantityDelta: params.quantityDelta,
        balanceAfter,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        createdByName: params.createdByName,
      },
    });
  }

  async getDepartmentStock(departmentId: string) {
    const items = await this.prisma.item.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
    });

    return Promise.all(
      items.map(async (item) => ({
        ...item,
        quantity: await this.getBalance(item.id, departmentId),
      })),
    );
  }
}
