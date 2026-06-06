import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getTenantContext } from '../common/tenant/tenant.context';
import { EntityTypesService } from '../entity-types/entity-types.service';
import { CreateEntityRecordDto } from './dto/create-entity-record.dto';
import { TransitionRecordDto } from './dto/transition-record.dto';

const RECORD_INCLUDE = {
  workflow: { include: { events: { orderBy: { createdAt: 'desc' as const } } } },
} as const;

@Injectable()
export class EntityRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entityTypes: EntityTypesService,
  ) {}

  async findAll(slug: string) {
    const et = await this.entityTypes.findBySlug(slug);
    const { tenantId } = getTenantContext();
    return this.prisma.entityRecord.findMany({
      where: { tenantId, entityTypeId: et.id },
      include: RECORD_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(slug: string, id: string) {
    const et = await this.entityTypes.findBySlug(slug);
    const { tenantId } = getTenantContext();
    const record = await this.prisma.entityRecord.findFirst({
      where: { id, tenantId, entityTypeId: et.id },
      include: RECORD_INCLUDE,
    });
    if (!record) throw new NotFoundException('Record not found');
    return record;
  }

  async create(slug: string, dto: CreateEntityRecordDto) {
    const et = await this.entityTypes.findBySlug(slug);
    const { tenantId } = getTenantContext();

    const record = await this.prisma.entityRecord.create({
      data: {
        tenantId,
        entityTypeId: et.id,
        attributes: (dto.attributes ?? {}) as any,
      },
      include: RECORD_INCLUDE,
    });

    // Auto-create WorkflowInstance if entity type has a workflow
    if (et.workflow) {
      const states = et.workflow.states as Array<{ id: string; initial?: boolean }>;
      const initialState = states.find((s) => s.initial);
      if (initialState) {
        await this.prisma.workflowInstance.create({
          data: { entityRecordId: record.id, currentState: initialState.id },
        });
      }
    }

    return this.findOne(slug, record.id);
  }

  async update(slug: string, id: string, dto: CreateEntityRecordDto) {
    const et = await this.entityTypes.findBySlug(slug);
    const { tenantId } = getTenantContext();
    const record = await this.prisma.entityRecord.findFirst({
      where: { id, tenantId, entityTypeId: et.id },
    });
    if (!record) throw new NotFoundException('Record not found');

    await this.prisma.entityRecord.update({
      where: { id },
      data: { attributes: (dto.attributes ?? {}) as any },
    });
    return this.findOne(slug, id);
  }

  async delete(slug: string, id: string) {
    const et = await this.entityTypes.findBySlug(slug);
    const { tenantId } = getTenantContext();
    const record = await this.prisma.entityRecord.findFirst({
      where: { id, tenantId, entityTypeId: et.id },
    });
    if (!record) throw new NotFoundException('Record not found');
    await this.prisma.entityRecord.delete({ where: { id } });
    return { deleted: true };
  }

  async transition(slug: string, id: string, dto: TransitionRecordDto) {
    const et = await this.entityTypes.findBySlug(slug);
    const { tenantId } = getTenantContext();

    if (!et.workflow) throw new BadRequestException('This entity type has no workflow');

    const record = await this.prisma.entityRecord.findFirst({
      where: { id, tenantId, entityTypeId: et.id },
      include: { workflow: true },
    });
    if (!record) throw new NotFoundException('Record not found');
    if (!record.workflow) throw new BadRequestException('Record has no workflow instance');

    const transitions = et.workflow.transitions as Array<{
      id: string; from: string; to: string; label: string; requiresApproval?: boolean;
    }>;
    const transition = transitions.find((t) => t.id === dto.transitionId);
    if (!transition) throw new NotFoundException(`Transition "${dto.transitionId}" not found`);
    if (transition.from !== record.workflow.currentState) {
      throw new BadRequestException(
        `Cannot apply transition from state "${record.workflow.currentState}"`,
      );
    }

    await this.prisma.workflowEvent.create({
      data: {
        workflowInstanceId: record.workflow.id,
        fromState: transition.from,
        toState: transition.to,
        transitionLabel: transition.label,
        actorName: dto.actorName ?? null,
        note: dto.note ?? null,
      },
    });

    await this.prisma.workflowInstance.update({
      where: { id: record.workflow.id },
      data: { currentState: transition.to },
    });

    await this.prisma.domainEvent.create({
      data: {
        tenantId,
        type: 'entity_record.transitioned',
        actorName: dto.actorName ?? null,
        payload: { entityType: slug, recordId: id, transition: transition.label, toState: transition.to },
      },
    });

    return this.findOne(slug, id);
  }
}
