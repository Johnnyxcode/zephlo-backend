import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Query,
} from '@nestjs/common';
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
  seed(@Query('secret') secret: string, @Body() dto: SeedDemoDto) {
    const expected = process.env.DEMO_SECRET;
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Invalid or missing demo secret');
    }
    return this.demoService.seedScenario(dto.scenario);
  }
}
