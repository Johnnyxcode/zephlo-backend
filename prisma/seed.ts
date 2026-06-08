import { FieldType, PrismaClient, TransferStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ── Teardown (Revenue Engine first, then Ops, then core) ─────────────────
  await prisma.payment.deleteMany();
  await prisma.invoiceLine.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.saleOrderLine.deleteMany();
  await prisma.saleOrder.deleteMany();
  await prisma.catalogItem.deleteMany();
  await prisma.taxRate.deleteMany();
  await prisma.customer.deleteMany();
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
  const tid = tenant.id;

  // ── Departments ───────────────────────────────────────────────────────────
  const kitchen = await prisma.department.create({
    data: { tenantId: tid, name: 'Kitchen', description: 'Main kitchen storage' },
  });
  const bar = await prisma.department.create({
    data: { tenantId: tid, name: 'Bar', description: 'Beverage service' },
  });
  const stores = await prisma.department.create({
    data: { tenantId: tid, name: 'Central Stores', description: 'Bulk storage and distribution' },
  });

  // ── Roles ─────────────────────────────────────────────────────────────────
  await prisma.role.createMany({
    data: [
      {
        tenantId: tid, name: 'Administrator', slug: 'admin',
        isDefault: false, capabilities: JSON.stringify(['*']), color: 'red',
      },
      {
        tenantId: tid, name: 'Store Manager', slug: 'store-manager',
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
        tenantId: tid, name: 'Staff', slug: 'staff',
        isDefault: true,
        capabilities: JSON.stringify(['inventory:read', 'transfer:read', 'transfer:request', 'entity:read']),
        color: 'slate',
      },
    ],
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  await prisma.user.createMany({
    data: [
      { tenantId: tid, email: 'admin@demo.com', name: 'Alex Admin', role: UserRole.ADMIN },
      { tenantId: tid, email: 'manager@demo.com', name: 'Sam Manager', role: UserRole.MANAGER, departmentId: stores.id },
      { tenantId: tid, email: 'kitchen@demo.com', name: 'Kim Kitchen', role: UserRole.STAFF, departmentId: kitchen.id },
      { tenantId: tid, email: 'bar@demo.com', name: 'Ben Barkeep', role: UserRole.STAFF, departmentId: bar.id },
    ],
  });

  // ── Field definitions ─────────────────────────────────────────────────────
  await prisma.fieldDefinition.createMany({
    data: [
      { departmentId: kitchen.id, key: 'expiry_date', label: 'Expiry date', type: FieldType.DATE, required: true, sortOrder: 0 },
      { departmentId: kitchen.id, key: 'supplier', label: 'Supplier', type: FieldType.TEXT, required: false, sortOrder: 1 },
      { departmentId: bar.id, key: 'brand', label: 'Brand', type: FieldType.TEXT, required: false, sortOrder: 0 },
      { departmentId: bar.id, key: 'abv', label: 'ABV (%)', type: FieldType.NUMBER, required: false, sortOrder: 1, config: { min: 0, max: 100 } },
      { departmentId: stores.id, key: 'reorder_level', label: 'Reorder level', type: FieldType.NUMBER, required: true, sortOrder: 0, config: { min: 0 } },
      { departmentId: stores.id, key: 'storage_location', label: 'Storage location', type: FieldType.TEXT, required: false, sortOrder: 1 },
    ],
  });

  // ── Department links ──────────────────────────────────────────────────────
  await prisma.departmentLink.createMany({
    data: [
      { tenantId: tid, fromDepartmentId: stores.id, toDepartmentId: kitchen.id, requiresApproval: true },
      { tenantId: tid, fromDepartmentId: stores.id, toDepartmentId: bar.id, requiresApproval: true },
      { tenantId: tid, fromDepartmentId: kitchen.id, toDepartmentId: bar.id, requiresApproval: false },
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

  // ── Initial stock ─────────────────────────────────────────────────────────
  async function seedStock(itemId: string, departmentId: string, qty: number) {
    await prisma.inventoryMovement.create({
      data: { tenantId: tid, departmentId, itemId, quantityDelta: qty, balanceAfter: qty, referenceType: 'INITIAL', createdByName: 'System' },
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
      tenantId: tid, name: 'Mediterranean Foods Ltd',
      contactName: 'Marco Ricci', contactEmail: 'marco@medfoods.example.com',
      phone: '+234 801 234 5678',
      notes: 'Primary olive oil and dry goods supplier. Net-30 terms.',
    },
  });
  const oceanHarvest = await prisma.supplier.create({
    data: {
      tenantId: tid, name: 'Ocean Harvest Ltd',
      contactName: 'Grace Asante', contactEmail: 'grace@oceanharvest.example.com',
      phone: '+234 802 987 6543',
      notes: 'Fresh and dried seafood. Delivers Tuesdays and Fridays.',
    },
  });
  const spiritsWorld = await prisma.supplier.create({
    data: {
      tenantId: tid, name: 'Spirits World Distribution',
      contactName: 'Dave Lowe', contactEmail: 'dave@spiritsworld.example.com',
      phone: '+234 803 555 1234',
      notes: 'Spirits and liqueur distributor. Minimum order ₦50,000.',
    },
  });

  // ── Purchase Orders ───────────────────────────────────────────────────────
  await prisma.purchaseOrder.create({
    data: {
      tenantId: tid, supplierId: medFoods.id, departmentId: stores.id,
      status: 'APPROVED', requestedByName: 'Sam Manager', approvedByName: 'Alex Admin',
      notes: 'Monthly dry goods restock', waybillNumber: 'WB-2026-0041',
      expectedAt: new Date('2026-06-15'),
      lines: {
        create: [
          { itemName: 'Flour (25kg)', sku: 'FLR-25', unit: 'bag', quantity: 10, unitCost: 8500 },
          { itemName: 'Caster Sugar (10kg)', sku: 'SUG-10', unit: 'bag', quantity: 5, unitCost: 5200 },
          { itemName: 'Olive Oil (5L)', sku: 'OIL-5L', unit: 'bottle', quantity: 8, unitCost: 9800 },
        ],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      tenantId: tid, supplierId: spiritsWorld.id, departmentId: bar.id,
      status: 'PENDING_APPROVAL', requestedByName: 'Ben Barkeep',
      notes: 'Bar restock for weekend event',
      expectedAt: new Date('2026-06-12'),
      lines: {
        create: [
          { itemName: 'London Dry Gin', sku: 'GIN-01', unit: 'bottle', quantity: 6, unitCost: 12500 },
          { itemName: 'Dark Rum', sku: 'RUM-01', unit: 'bottle', quantity: 4, unitCost: 14000 },
        ],
      },
    },
  });

  await prisma.purchaseOrder.create({
    data: {
      tenantId: tid, supplierId: oceanHarvest.id, departmentId: kitchen.id,
      status: 'RECEIVED', requestedByName: 'Kim Kitchen', approvedByName: 'Sam Manager',
      notes: 'Weekly seafood order', waybillNumber: 'WB-2026-0038',
      expectedAt: new Date('2026-06-03'), completedAt: new Date('2026-06-03'),
      lines: {
        create: [
          { itemName: 'Dried Salt Fish (5kg)', sku: 'FISH-SF', unit: 'bag', quantity: 3, unitCost: 18000 },
        ],
      },
    },
  });

  // ── Transfer Requests ─────────────────────────────────────────────────────
  await prisma.transferRequest.create({
    data: {
      tenantId: tid, fromDepartmentId: stores.id, toDepartmentId: kitchen.id,
      status: TransferStatus.COMPLETED, requestedByName: 'Kim Kitchen', approvedByName: 'Sam Manager',
      completedAt: new Date('2026-06-01'),
      lines: { create: [{ itemId: flour.id, quantity: 5 }, { itemId: tomatoes.id, quantity: 8 }] },
    },
  });

  await prisma.transferRequest.create({
    data: {
      tenantId: tid, fromDepartmentId: stores.id, toDepartmentId: bar.id,
      status: TransferStatus.PENDING_APPROVAL, requestedByName: 'Ben Barkeep',
      lines: { create: [{ itemId: sugar.id, quantity: 3 }] },
    },
  });

  // ── Tax Rates ─────────────────────────────────────────────────────────────
  const vat = await prisma.taxRate.create({
    data: { tenantId: tid, name: 'VAT', rate: 7.5, isDefault: true },
  });
  await prisma.taxRate.create({
    data: { tenantId: tid, name: 'Zero-rated', rate: 0, isDefault: false },
  });

  // ── Catalog Items ─────────────────────────────────────────────────────────
  const pepper_soup = await prisma.catalogItem.create({
    data: { tenantId: tid, name: 'Pepper Soup (bowl)', sku: 'FOOD-PS', sellingPrice: 3500, costPrice: 1200, unit: 'bowl', taxRateId: vat.id },
  });
  const jollof_rice = await prisma.catalogItem.create({
    data: { tenantId: tid, name: 'Jollof Rice & Chicken', sku: 'FOOD-JRC', sellingPrice: 4500, costPrice: 1800, unit: 'plate', taxRateId: vat.id },
  });
  const suya = await prisma.catalogItem.create({
    data: { tenantId: tid, name: 'Suya Platter', sku: 'FOOD-SY', sellingPrice: 5500, costPrice: 2200, unit: 'platter', taxRateId: vat.id },
  });
  const cocktail = await prisma.catalogItem.create({
    data: { tenantId: tid, name: 'Signature Cocktail', sku: 'BAR-SC', sellingPrice: 3000, costPrice: 900, unit: 'glass', taxRateId: vat.id },
  });
  const water = await prisma.catalogItem.create({
    data: { tenantId: tid, name: 'Still Water (75cl)', sku: 'BAR-WTR', sellingPrice: 500, costPrice: 150, unit: 'bottle' },
  });
  const maltDrink = await prisma.catalogItem.create({
    data: { tenantId: tid, name: 'Malt Drink', sku: 'BAR-MLT', sellingPrice: 800, costPrice: 350, unit: 'bottle' },
  });

  // ── Customers ─────────────────────────────────────────────────────────────
  const tunde = await prisma.customer.create({
    data: {
      tenantId: tid, name: 'Tunde Bakare',
      email: 'tunde.bakare@example.com', phone: '+234 802 111 2233',
      address: '14 Adeola Odeku St, Victoria Island, Lagos',
      notes: 'Regular corporate client. Prefers table 7.',
    },
  });
  const adaeze = await prisma.customer.create({
    data: {
      tenantId: tid, name: 'Adaeze Okonkwo',
      email: 'adaeze@brightwave.ng', phone: '+234 803 444 5566',
      address: '3 Ozumba Mbadiwe Ave, Lagos',
      notes: 'Event bookings only. Contact 48hrs in advance.',
    },
  });
  const chidi = await prisma.customer.create({
    data: {
      tenantId: tid, name: 'Chidi Enterprises Ltd',
      email: 'orders@chidi-ent.ng', phone: '+234 701 888 9900',
      address: '7 Trans Amadi Industrial Layout, Port Harcourt',
      notes: 'Corporate account. Net-14 payment terms.',
    },
  });

  // ── Sale Orders ───────────────────────────────────────────────────────────
  const order1 = await prisma.saleOrder.create({
    data: {
      tenantId: tid, customerId: tunde.id, status: 'INVOICED',
      reference: 'TBL-007', createdByName: 'Alex Admin',
      lines: {
        create: [
          { catalogItemId: jollof_rice.id, description: 'Jollof Rice & Chicken', quantity: 2, unitPrice: 4500, discount: 0 },
          { catalogItemId: pepper_soup.id, description: 'Pepper Soup (bowl)', quantity: 1, unitPrice: 3500, discount: 0 },
          { catalogItemId: cocktail.id, description: 'Signature Cocktail', quantity: 2, unitPrice: 3000, discount: 0 },
        ],
      },
    },
  });

  const order2 = await prisma.saleOrder.create({
    data: {
      tenantId: tid, customerId: chidi.id, status: 'CONFIRMED',
      reference: 'CORP-2026-014', createdByName: 'Alex Admin',
      notes: 'Board dinner — private dining room',
      lines: {
        create: [
          { catalogItemId: suya.id, description: 'Suya Platter', quantity: 4, unitPrice: 5500, discount: 10 },
          { catalogItemId: jollof_rice.id, description: 'Jollof Rice & Chicken', quantity: 8, unitPrice: 4500, discount: 10 },
          { catalogItemId: cocktail.id, description: 'Signature Cocktail', quantity: 6, unitPrice: 3000, discount: 0 },
          { catalogItemId: maltDrink.id, description: 'Malt Drink', quantity: 10, unitPrice: 800, discount: 0 },
        ],
      },
    },
  });

  await prisma.saleOrder.create({
    data: {
      tenantId: tid, customerId: adaeze.id, status: 'DRAFT',
      reference: 'EVT-JUL-001', createdByName: 'Alex Admin',
      notes: 'Tentative: birthday event 12 July',
      lines: {
        create: [
          { catalogItemId: suya.id, description: 'Suya Platter', quantity: 6, unitPrice: 5500, discount: 0 },
          { catalogItemId: jollof_rice.id, description: 'Jollof Rice & Chicken', quantity: 12, unitPrice: 4500, discount: 0 },
          { catalogItemId: water.id, description: 'Still Water (75cl)', quantity: 24, unitPrice: 500, discount: 0 },
        ],
      },
    },
  });

  // ── Invoices ──────────────────────────────────────────────────────────────
  // Invoice for order1 (Tunde — PAID)
  const inv1Lines = [
    { catalogItemId: jollof_rice.id, description: 'Jollof Rice & Chicken', quantity: 2, unitPrice: 4500, taxRate: 7.5, discount: 0, lineTotal: 2 * 4500 * 1.075 },
    { catalogItemId: pepper_soup.id, description: 'Pepper Soup (bowl)', quantity: 1, unitPrice: 3500, taxRate: 7.5, discount: 0, lineTotal: 3500 * 1.075 },
    { catalogItemId: cocktail.id, description: 'Signature Cocktail', quantity: 2, unitPrice: 3000, taxRate: 7.5, discount: 0, lineTotal: 2 * 3000 * 1.075 },
  ];
  const inv1Subtotal = 2 * 4500 + 3500 + 2 * 3000;
  const inv1Tax = inv1Subtotal * 0.075;
  const inv1Total = inv1Subtotal + inv1Tax;

  const inv1 = await prisma.invoice.create({
    data: {
      tenantId: tid, invoiceNumber: 'INV-0001', customerId: tunde.id, saleOrderId: order1.id,
      status: 'PAID', issueDate: new Date('2026-06-02'), dueDate: new Date('2026-06-16'),
      subtotal: inv1Subtotal, taxAmount: inv1Tax, total: inv1Total, paidAmount: inv1Total,
      createdByName: 'Alex Admin',
      lines: { create: inv1Lines },
    },
  });

  // Mark order1 as INVOICED
  await prisma.saleOrder.update({ where: { id: order1.id }, data: { status: 'INVOICED' } });

  // Payment for inv1
  await prisma.payment.create({
    data: {
      tenantId: tid, invoiceId: inv1.id, amount: inv1Total,
      method: 'BANK_TRANSFER', reference: 'TRF/2026/06/112234',
      paidAt: new Date('2026-06-02'), recordedByName: 'Alex Admin',
    },
  });

  // Invoice for order2 (Chidi — PARTIALLY_PAID)
  const inv2Lines = [
    { catalogItemId: suya.id, description: 'Suya Platter', quantity: 4, unitPrice: 5500, taxRate: 7.5, discount: 10, lineTotal: 4 * 5500 * 0.9 * 1.075 },
    { catalogItemId: jollof_rice.id, description: 'Jollof Rice & Chicken', quantity: 8, unitPrice: 4500, taxRate: 7.5, discount: 10, lineTotal: 8 * 4500 * 0.9 * 1.075 },
    { catalogItemId: cocktail.id, description: 'Signature Cocktail', quantity: 6, unitPrice: 3000, taxRate: 7.5, discount: 0, lineTotal: 6 * 3000 * 1.075 },
    { catalogItemId: maltDrink.id, description: 'Malt Drink', quantity: 10, unitPrice: 800, taxRate: 0, discount: 0, lineTotal: 10 * 800 },
  ];
  const inv2Subtotal = 4 * 5500 * 0.9 + 8 * 4500 * 0.9 + 6 * 3000 + 10 * 800;
  const inv2Tax = (4 * 5500 * 0.9 + 8 * 4500 * 0.9 + 6 * 3000) * 0.075;
  const inv2Total = inv2Subtotal + inv2Tax;
  const inv2Deposit = 50000;

  const inv2 = await prisma.invoice.create({
    data: {
      tenantId: tid, invoiceNumber: 'INV-0002', customerId: chidi.id, saleOrderId: order2.id,
      status: 'PARTIALLY_PAID', issueDate: new Date('2026-06-05'), dueDate: new Date('2026-06-19'),
      subtotal: inv2Subtotal, taxAmount: inv2Tax, total: inv2Total, paidAmount: inv2Deposit,
      createdByName: 'Alex Admin',
      lines: { create: inv2Lines },
    },
  });

  // Deposit payment for inv2
  await prisma.payment.create({
    data: {
      tenantId: tid, invoiceId: inv2.id, amount: inv2Deposit,
      method: 'BANK_TRANSFER', reference: 'TRF/2026/06/119988',
      paidAt: new Date('2026-06-06'), recordedByName: 'Alex Admin',
      notes: '50% deposit received',
    },
  });

  // ── Domain event ──────────────────────────────────────────────────────────
  await prisma.domainEvent.create({
    data: {
      tenantId: tid, type: 'tenant.seeded', actorName: 'System',
      payload: {
        departments: 3, items: 7, suppliers: 3, purchaseOrders: 3,
        customers: 3, catalogItems: 6, saleOrders: 3, invoices: 2,
      },
    },
  });

  console.log('Seed complete:', { tenant: tenant.slug });
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
