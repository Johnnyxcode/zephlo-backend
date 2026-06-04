import { Body, Controller, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { DemoService } from './demo.service';

class SeedDemoDto {
  @IsIn(['restaurant', 'clinic'])
  scenario: 'restaurant' | 'clinic';
}

@Controller('demo')
export class DemoController {
  constructor(private readonly demoService: DemoService) {}

  @Post('seed')
  seed(@Body() dto: SeedDemoDto) {
    return this.demoService.seedScenario(dto.scenario);
  }
}
