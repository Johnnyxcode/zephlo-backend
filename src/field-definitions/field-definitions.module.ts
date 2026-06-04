import { Module } from '@nestjs/common';
import { FieldDefinitionsController } from './field-definitions.controller';
import { FieldDefinitionsService } from './field-definitions.service';

@Module({
  controllers: [FieldDefinitionsController],
  providers: [FieldDefinitionsService],
})
export class FieldDefinitionsModule {}
