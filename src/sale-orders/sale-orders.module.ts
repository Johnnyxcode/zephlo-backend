import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { SaleOrdersController } from './sale-orders.controller';
import { SaleOrdersService } from './sale-orders.service';

@Module({
  imports: [InventoryModule],
  controllers: [SaleOrdersController],
  providers: [SaleOrdersService],
  exports: [SaleOrdersService],
})
export class SaleOrdersModule {}
