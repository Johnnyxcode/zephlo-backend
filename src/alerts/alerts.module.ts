import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [InventoryModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
