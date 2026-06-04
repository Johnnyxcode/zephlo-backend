import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AlertsController } from './alerts/alerts.controller';
import { AlertsModule } from './alerts/alerts.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { ConnectionsController } from './connections/connections.controller';
import { ConnectionsModule } from './connections/connections.module';
import { DemoModule } from './demo/demo.module';
import { DepartmentsController } from './departments/departments.controller';
import { DepartmentsModule } from './departments/departments.module';
import { FieldDefinitionsController } from './field-definitions/field-definitions.controller';
import { FieldDefinitionsModule } from './field-definitions/field-definitions.module';
import { HealthController } from './health/health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { ItemsController } from './items/items.controller';
import { ItemsModule } from './items/items.module';
import { PrismaModule } from './prisma/prisma.module';
import { PurchaseOrdersController } from './purchase-orders/purchase-orders.controller';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { ReportsController } from './reports/reports.controller';
import { ReportsModule } from './reports/reports.module';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersModule } from './suppliers/suppliers.module';
import { TenantsController } from './tenants/tenants.controller';
import { TenantsModule } from './tenants/tenants.module';
import { TransfersController } from './transfers/transfers.controller';
import { TransfersModule } from './transfers/transfers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    InventoryModule,
    DepartmentsModule,
    FieldDefinitionsModule,
    ConnectionsModule,
    ItemsModule,
    TransfersModule,
    ReportsModule,
    TenantsModule,
    SuppliersModule,
    PurchaseOrdersModule,
    AlertsModule,
    DemoModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes(
        DepartmentsController,
        FieldDefinitionsController,
        ConnectionsController,
        ItemsController,
        TransfersController,
        ReportsController,
        TenantsController,
        SuppliersController,
        PurchaseOrdersController,
        AlertsController,
      );
    // PublicTenantsController and DemoController are intentionally excluded
  }
}
