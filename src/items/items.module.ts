import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  imports: [InventoryModule],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class ItemsModule {}
