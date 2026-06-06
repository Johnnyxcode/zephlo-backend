import { Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { PublicTenantsController } from './public-tenants.controller';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [RolesModule],
  controllers: [PublicTenantsController, TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
