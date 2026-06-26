import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  getCurrent() {
    return this.tenantsService.getCurrent();
  }

  @Patch('current')
  updateCurrent(@Body() dto: UpdateTenantDto) {
    return this.tenantsService.updateCurrent(dto);
  }

  @Post('reset')
  reset() {
    return this.tenantsService.resetCurrent();
  }
}
