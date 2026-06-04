import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantStorage } from './tenant.context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const slug = req.headers['x-tenant-slug'] as string | undefined;
    if (!slug) {
      throw new NotFoundException(
        'Missing X-Tenant-Slug header. Create a business in onboarding first.',
      );
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      throw new NotFoundException(`Tenant "${slug}" not found`);
    }

    tenantStorage.run(
      { tenantId: tenant.id, tenantSlug: tenant.slug },
      () => next(),
    );
  }
}
