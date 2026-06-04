import { Controller, Get, Post } from '@nestjs/common';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  getCurrent() {
    return this.tenantsService.getCurrent();
  }

  @Post('reset')
  reset() {
    return this.tenantsService.resetCurrent();
  }
}
