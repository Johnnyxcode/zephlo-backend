import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AllItemsController, ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  imports: [InventoryModule],
  controllers: [ItemsController, AllItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
