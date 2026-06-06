import { Module } from '@nestjs/common';
import { EntityTypesModule } from '../entity-types/entity-types.module';
import { EntityRecordsController } from './entity-records.controller';
import { EntityRecordsService } from './entity-records.service';

@Module({
  imports: [EntityTypesModule],
  controllers: [EntityRecordsController],
  providers: [EntityRecordsService],
})
export class EntityRecordsModule {}
