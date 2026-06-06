import { FieldType, PrismaClient, TransferStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ── Teardown (dependency order) ───────────────────────────────────────────
  await prisma.workflowEvent.deleteMany();
  await prisma.workflowInstance.deleteMany();
  await prisma.entityRecord.deleteMany();
  await prisma.workflowDefinition.deleteMany();
  await prisma.entityField.deleteMany();
  await prisma.entityType.deleteMany();
  await prisma.domainEvent.deleteMany();
  await prisma.transferLine.deleteMany();
  await prisma.transferRequest.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.pOLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.item.deleteMany();
  await prisma.fieldDefinition.deleteMany();
  await prisma.departmentLink.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.tenant.deleteMany();

  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.create({
    data: { name: 'Demo Business', slug: 'demo' },
  });

  // ── Departments ───────────────────────────────────────────────────────────
  const kitchen = await prisma.department.create({
    data: { tenantId: tenant.id, name: 'Kitchen', description: 'Main kitchen storage' },
  });
  const bar = await prisma.department.create({
    data: { tenantId: tenant.id, name: 'Bar', description: 'Beverage service' },
  });
  const stores = await prisma.department.create({
    data: { tenantId: tenant.id, name: 'Central Stores', description: 'Bulk storage and distribution' },
  });

  // ── Roles ─────────────────────────────────────────────────────────────────
  await prisma.role.createMany({
    data: [
      {
        tenantId: tenant.id,
        name: 'Administrator',
        slug: 'admin',
        isDefault: false,
        capabilities: JSON.stringify(['*']),
        color: 'red',
      },
      {
        tenantId: tenant.id,
        name: 'Store Manager',
        slug: 'store-manager',
        isDefault: false,
        capabilities: JSON.stringify([
          'inventory:read', 'inventory:write',
          'transfer:read', 'transfer:approve',
          'po:read', 'po:approve',
          'entity:read', 'entity:write',
        ]),
        color: 'blue',
      },
      {
        tenantId: tenant.id,
        name: 'Staff',
        slug: 'staff',
        isDefault: true,
        capabilities: JSON.stringify([
          'inventory:read',
          'transfer:read', 'transfer:request',
          'entity:read',
        ]),
        color: 'slate',
      },
    ],
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  await prisma.user.createMany({
    data: [
      { tenantId: tenant.id, email: 'admin@demo.com', name: 'Alex Admin', role: UserRole.ADMIN },
      { tenantId: tenant.id, email: 'manager@demo.com', name: 'Sam Manager', role: UserRole.MANAGER, departmentId: stores.id },
      { tenantId: tenant.id, email: 'kitchen@demo.com', name: 'Kim Kitchen', role: UserRole.STAFF, departmentId: kitchen.id },
      { tenantId: tenant.id, email: 'bar@demo.com', name: 'Ben Barkeep', role: UserRole.STAFF, departmentId: bar.id },
    ],
  });

  // ── Field definitions (inventory custom fields) ───────────────────────────
  await prisma.fieldDefinition.createMany({
    data: [
      { departmentId: kitchen.id, key: 'expiry_date', label: 'Expiry date', type: FieldType.DATE, required: true, sortOrder: 0 },
      { departmentId: kitchen.id, key: 'supplier', label: 'Supplier', type: FieldType.TEXT, required: false, sortOrder: 1 },
      { departmentId: bar.id, key: 'brand', label: 'Brand', type: FieldType.TEXT, required: false, sortOrder: 0 },
      { departmentId: bar.id, key: 'abv', label: 'ABV (%)', type: FieldType.NUMBER, required: false, sortOrder: 1, config: { min: 0, max: 100 } },
      {
        departmentId: stores.id, key: 'reorder_level', label: 'Reorder level',
        type: FieldType.NUMBER, required: true, sortOrder: 0, config: { min: 0 },
      },
      { departmentId: stores.id, key: 'storage_location', label: 'Storage location', type: FieldType.TEXT, required: false, sortOrder: 1 },
    ],
  });

  // ── Department links ──────────────────────────────────────────────────────
  await prisma.departmentLink.createMany({
    data: [
      { tenantId: tenant.id, fromDepartmentId: stores.id, toDepartmentId: kitchen.id, requiresApproval: true },
      { tenantId: tenant.id, fromDepartmentId: stores.id, toDepartmentId: bar.id, requiresApproval: true },
      { tenantId: tenant.id, fromDepartmentId: kitchen.id, toDepartmentId: bar.id, requiresApproval: false },
    ],
  });

  // ── Items ─────────────────────────────────────────────────────────────────
  const flour = await prisma.item.create({
    data: { departmentId: stores.id, name: 'Flour (25kg)', sku: 'FLR-25', attributes: { reorder_level: 5, storage_location: 'Shelf A1' } },
  });
  const tomatoes = await prisma.item.create({
    data: { departmentId: stores.id, name: 'Tomatoes (crate)', sku: 'TOM-CR', attributes: { reorder_level: 10, storage_location: 'Shelf B2' } },
  });
  const sugar = await prisma.item.create({
    data: { departmentId: stores.id, name: 'Caster Sugar (10kg)', sku: 'SUG-10', attributes: { reorder_level: 8, storage_location: 'Shelf A2' } },
  });
  const gin = await prisma.item.create({
    data: { departmentId: bar.id, name: 'London Dry Gin', sku: 'GIN-01', attributes: { brand: 'House Label', abv: 40 } },
  });
  const rum = await prisma.item.create({
    data: { departmentId: bar.id, name: 'Dark Rum', sku: 'RUM-01', attributes: { brand: 'Plantation', abv: 43 } },
  });
  const oliveOil = await prisma.item.create({
    data: { departmentId: kitchen.id, name: 'Olive Oil (5L)', sku: 'OIL-5L', attributes: { expiry_date: '2027-03-01', supplier: 'Mediterranean Foods' } },
  });
  const saltFish = await prisma.item.create({
    data: { departmentId: kitchen.id, name: 'Dried Salt Fish (5kg)', sku: 'FISH-SF', attributes: { expiry_date: '2026-12-01', supplier: 'Ocean Harvest Ltd' } },
  });

  // ── Initial stock movements ───────────────────────────────────────────────
  async function seedStock(itemId: string, departmentId: string, qty: number) {
    await prisma.inventoryMovement.create({
      data: {
        tenantId: tenant.id,
        departmentId,
        itemId,
        quantityDelta: qty,
        balanceAfter: qty,
        referenceType: 'INITIAL',
        createdByName: 'System',
      },
    });
  }

  await seedStock(flour.id, stores.id, 40);
  await seedStock(tomatoes.id, stores.id, 25);
  await seedStock(sugar.id, stores.id, 30);
  await seedStock(gin.id, bar.id, 18);
  await seedStock(rum.id, bar.id, 12);
  await seedStock(oliveOil.id, kitchen.id, 12);
  await seedStock(saltFish.id, kitchen.id, 6);

  // ── Suppliers ─────────────────────────────────────────────────────────────
  const medFoods = await prisma.supplier.create({
    data: {
      tenantId: tenant.id,
      name: 'Mediterranean Foods Ltd',
      contactName: 'Marco Ricci',
      contactEmail: 'marco@medfoods.example.com',
      phone: '+44 20 1234 5678',
      notes: 'Primary olive oil and dry goods supplier. Net-30 terms.',
    },
  });
  const oceanHarvest = await prisma.supplier.create({
    data: {
      tenantId: tenant.id,
      name: 'Ocean Harvest Ltd',
      contactName: 'Grace Asante',
      contactEmail: 'grace@oceanharvest.example.com',
      phone: '+44 20 9876 5432',
      notes: 'Fresh and dried seafood. Delivers Tuesdays and Fridays.',
    },
  });
  const spiritsWorld = await prisma.supplier.create({
    data: {
      tenantId: tenant.id,
      name: 'Spirits World Distribution',
      contactName: 'Dave Lowe',
      contactEmail: 'dave@spiritsworld.example.com',
      phone: '+44 20 5555 1234',
      notes: 'Spirits and liqueur distributor. Minimum order £200.',
    },
  });

  // ── Purchase Orders ───────────────────────────────────────────────────────
  await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id,
      supplierId: medFoods.id,
      departmentId: stores.id,
      status: 'APPROVED',
      requestedByName: 'Sam Manager',
      approvedByName: 'Alex Admin',
      notes: 'Monthly dry goods restock',
      expectedAt: new Date('2026-06-15'),
      lines: {
        create: [
          { itemName: 'Flour (25kg)', sku: 'FLR-25', quantity: 10, unitCost: 18.5 },
          { itemName: 'Caster Sugar (10kg)', sku: 'SUG-10', quantity: 5, unitCost: 12.0 },
          { itemName: 'Olive Oil (5L)', sku: 'OIL-5L', quantity: 8, unitCost: 22.0 },
        ],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id,
      supplierId: spiritsWorld.id,
      departmentId: bar.id,
      status: 'PENDING_APPROVAL',
      requestedByName: 'Ben Barkeep',
      notes: 'Bar restock for weekend event',
      expectedAt: new Date('2026-06-12'),
      lines: {
        create: [
          { itemName: 'London Dry Gin', sku: 'GIN-01', quantity: 6, unitCost: 24.0 },
          { itemName: 'Dark Rum', sku: 'RUM-01', quantity: 4, unitCost: 28.5 },
        ],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      tenantId: tenant.id,
      supplierId: oceanHarvest.id,
      departmentId: kitchen.id,
      status: 'RECEIVED',
      requestedByName: 'Kim Kitchen',
      approvedByName: 'Sam Manager',
      notes: 'Weekly seafood order',
      expectedAt: new Date('2026-06-03'),
      completedAt: new Date('2026-06-03'),
      lines: {
        create: [
          { itemName: 'Dried Salt Fish (5kg)', sku: 'FISH-SF', quantity: 3, unitCost: 35.0 },
        ],
      },
    },
  });

  // ── Transfer Requests ─────────────────────────────────────────────────────
  await prisma.transferRequest.create({
    data: {
      tenantId: tenant.id,
      fromDepartmentId: stores.id,
      toDepartmentId: kitchen.id,
      status: TransferStatus.COMPLETED,
      requestedByName: 'Kim Kitchen',
      approvedByName: 'Sam Manager',
      completedAt: new Date('2026-06-01'),
      lines: { create: [{ itemId: flour.id, quantity: 5 }, { itemId: tomatoes.id, quantity: 8 }] },
    },
  });

  await prisma.transferRequest.create({
    data: {
      tenantId: tenant.id,
      fromDepartmentId: stores.id,
      toDepartmentId: bar.id,
      status: TransferStatus.PENDING_APPROVAL,
      requestedByName: 'Ben Barkeep',
      lines: { create: [{ itemId: sugar.id, quantity: 3 }] },
    },
  });

  // ── Domain event ──────────────────────────────────────────────────────────
  await prisma.domainEvent.create({
    data: {
      tenantId: tenant.id,
      type: 'tenant.seeded',
      actorName: 'System',
      payload: { departments: 3, items: 7, suppliers: 3, purchaseOrders: 3 },
    },
  });

  console.log('Seed complete:', { tenant: tenant.slug });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
