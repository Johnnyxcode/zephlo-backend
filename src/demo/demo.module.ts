import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [InventoryModule],
  controllers: [DemoController],
  providers: [DemoService],
})
export class DemoModule {}
