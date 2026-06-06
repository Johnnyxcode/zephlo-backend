import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type MovementParams = {
  tenantId: string;
  departmentId: string;
  itemId: string;
  quantityDelta: number;
  referenceType: string;
  referenceId?: string;
  createdByName?: string;
};

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

  // For use inside an existing $transaction — no nested transaction.
  async applyMovementInTx(
    tx: Prisma.TransactionClient,
    params: MovementParams,
  ) {
    const latest = await tx.inventoryMovement.findFirst({
      where: { itemId: params.itemId, departmentId: params.departmentId },
      orderBy: { createdAt: 'desc' },
    });
    const balanceAfter = (latest?.balanceAfter ?? 0) + params.quantityDelta;
    if (balanceAfter < 0) {
      throw new BadRequestException('Insufficient stock');
    }
    return tx.inventoryMovement.create({
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

  // Standalone call — wraps in its own transaction so balance read + write are atomic.
  async recordMovement(params: MovementParams) {
    return this.prisma.$transaction((tx) => this.applyMovementInTx(tx, params));
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
