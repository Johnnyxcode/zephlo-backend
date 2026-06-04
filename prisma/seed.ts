import { FieldType, PrismaClient, TransferStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.domainEvent.deleteMany();
  await prisma.transferLine.deleteMany();
  await prisma.transferRequest.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.item.deleteMany();
  await prisma.fieldDefinition.deleteMany();
  await prisma.departmentLink.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: {
      name: 'Demo Business',
      slug: 'demo',
    },
  });

  const kitchen = await prisma.department.create({
    data: {
      tenantId: tenant.id,
      name: 'Kitchen',
      description: 'Main kitchen storage',
    },
  });

  const bar = await prisma.department.create({
    data: {
      tenantId: tenant.id,
      name: 'Bar',
      description: 'Beverage service',
    },
  });

  const stores = await prisma.department.create({
    data: {
      tenantId: tenant.id,
      name: 'Central Stores',
      description: 'Bulk storage and distribution',
    },
  });

  await prisma.user.createMany({
    data: [
      {
        tenantId: tenant.id,
        email: 'admin@demo.com',
        name: 'Alex Admin',
        role: UserRole.ADMIN,
      },
      {
        tenantId: tenant.id,
        email: 'manager@demo.com',
        name: 'Sam Manager',
        role: UserRole.MANAGER,
        departmentId: stores.id,
      },
      {
        tenantId: tenant.id,
        email: 'kitchen@demo.com',
        name: 'Kim Kitchen',
        role: UserRole.STAFF,
        departmentId: kitchen.id,
      },
    ],
  });

  await prisma.fieldDefinition.createMany({
    data: [
      {
        departmentId: kitchen.id,
        key: 'expiry_date',
        label: 'Expiry date',
        type: FieldType.DATE,
        required: true,
        sortOrder: 0,
      },
      {
        departmentId: kitchen.id,
        key: 'supplier',
        label: 'Supplier',
        type: FieldType.TEXT,
        required: false,
        sortOrder: 1,
      },
      {
        departmentId: bar.id,
        key: 'brand',
        label: 'Brand',
        type: FieldType.TEXT,
        required: false,
        sortOrder: 0,
      },
      {
        departmentId: stores.id,
        key: 'reorder_level',
        label: 'Reorder level',
        type: FieldType.NUMBER,
        required: true,
        sortOrder: 0,
        config: { min: 0 },
      },
    ],
  });

  await prisma.departmentLink.createMany({
    data: [
      {
        tenantId: tenant.id,
        fromDepartmentId: stores.id,
        toDepartmentId: kitchen.id,
        requiresApproval: true,
      },
      {
        tenantId: tenant.id,
        fromDepartmentId: stores.id,
        toDepartmentId: bar.id,
        requiresApproval: true,
      },
      {
        tenantId: tenant.id,
        fromDepartmentId: kitchen.id,
        toDepartmentId: bar.id,
        requiresApproval: false,
      },
    ],
  });

  const flour = await prisma.item.create({
    data: {
      departmentId: stores.id,
      name: 'Flour (25kg)',
      sku: 'FLR-25',
      attributes: { reorder_level: 5 },
    },
  });

  const tomatoes = await prisma.item.create({
    data: {
      departmentId: stores.id,
      name: 'Tomatoes (crate)',
      sku: 'TOM-CR',
      attributes: { reorder_level: 10 },
    },
  });

  const gin = await prisma.item.create({
    data: {
      departmentId: bar.id,
      name: 'London Dry Gin',
      sku: 'GIN-01',
      attributes: { brand: 'House Label' },
    },
  });

  const oliveOil = await prisma.item.create({
    data: {
      departmentId: kitchen.id,
      name: 'Olive Oil (5L)',
      sku: 'OIL-5L',
      attributes: {
        expiry_date: '2026-09-01',
        supplier: 'Mediterranean Foods',
      },
    },
  });

  async function seedStock(
    itemId: string,
    departmentId: string,
    quantity: number,
    tenantId: string,
  ) {
    await prisma.inventoryMovement.create({
      data: {
        tenantId,
        departmentId,
        itemId,
        quantityDelta: quantity,
        balanceAfter: quantity,
        referenceType: 'INITIAL',
        createdByName: 'System',
      },
    });
  }

  await seedStock(flour.id, stores.id, 40, tenant.id);
  await seedStock(tomatoes.id, stores.id, 25, tenant.id);
  await seedStock(gin.id, bar.id, 18, tenant.id);
  await seedStock(oliveOil.id, kitchen.id, 12, tenant.id);

  await prisma.domainEvent.create({
    data: {
      tenantId: tenant.id,
      type: 'tenant.seeded',
      actorName: 'System',
      payload: { departments: 3, items: 4 },
    },
  });

  console.log('Seed complete:', { tenant: tenant.slug });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
