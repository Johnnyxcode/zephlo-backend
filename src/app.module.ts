import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AlertsController } from './alerts/alerts.controller';
import { AlertsModule } from './alerts/alerts.module';
import { CustomersController } from './customers/customers.controller';
import { CustomersModule } from './customers/customers.module';
import { TaxRatesController } from './tax-rates/tax-rates.controller';
import { TaxRatesModule } from './tax-rates/tax-rates.module';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogModule } from './catalog/catalog.module';
import { SaleOrdersController } from './sale-orders/sale-orders.controller';
import { SaleOrdersModule } from './sale-orders/sale-orders.module';
import { InvoicesController } from './invoices/invoices.controller';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsModule } from './payments/payments.module';
import { EntityRecordsController } from './entity-records/entity-records.controller';
import { EntityRecordsModule } from './entity-records/entity-records.module';
import { EntityTypesController } from './entity-types/entity-types.controller';
import { EntityTypesModule } from './entity-types/entity-types.module';
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
import { AllItemsController, ItemsController } from './items/items.controller';
import { ItemsModule } from './items/items.module';
import { PrismaModule } from './prisma/prisma.module';
import { PurchaseOrdersController } from './purchase-orders/purchase-orders.controller';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { ReportsController } from './reports/reports.controller';
import { ReportsModule } from './reports/reports.module';
import { RolesController } from './roles/roles.controller';
import { RolesModule } from './roles/roles.module';
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
    EntityTypesModule,
    EntityRecordsModule,
    RolesModule,
    CustomersModule,
    TaxRatesModule,
    CatalogModule,
    SaleOrdersModule,
    InvoicesModule,
    PaymentsModule,
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
        AllItemsController,
        TransfersController,
        ReportsController,
        TenantsController,
        SuppliersController,
        PurchaseOrdersController,
        AlertsController,
        EntityTypesController,
        EntityRecordsController,
        RolesController,
        CustomersController,
        TaxRatesController,
        CatalogController,
        SaleOrdersController,
        InvoicesController,
        PaymentsController,
      );
    // PublicTenantsController and DemoController are intentionally excluded
  }
}
