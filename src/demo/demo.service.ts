import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

type Scenario = 'restaurant' | 'clinic';

type FieldSeed = {
  key: string;
  label: string;
  fieldType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SELECT' | 'RELATION';
  required?: boolean;
  config?: Record<string, unknown>;
};

type WorkflowStateSeed = {
  id: string;
  label: string;
  initial?: boolean;
  terminal?: boolean;
  color?: string;
};

type WorkflowTransitionSeed = {
  id: string;
  from: string;
  to: string;
  label: string;
  requiresApproval?: boolean;
};

type EntityTypeSeed = {
  key: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  roles: string[];
  fields: FieldSeed[];
  workflow: {
    states: WorkflowStateSeed[];
    transitions: WorkflowTransitionSeed[];
  } | null;
  // RELATION field values should be "entityTypeSlug:recordKey" — resolved at seed time
  records: Array<{ key: string; attributes: Record<string, unknown>; initialState: string | null }>;
};

type RevenueEngineSeed = {
  taxRates: Array<{ name: string; rate: number; isDefault?: boolean }>;
  catalogItems: Array<{ key: string; name: string; sku?: string; sellingPrice: number; costPrice?: number; unit?: string; taxRateKey?: string }>;
  customers: Array<{ key: string; name: string; email?: string; phone?: string; address?: string; notes?: string }>;
  saleOrders: Array<{
    customerKey: string;
    reference?: string;
    status: string;
    notes?: string;
    lines: Array<{ catalogItemKey: string; quantity: number; unitPrice: number }>;
  }>;
  invoices: Array<{
    customerKey: string;
    saleOrderKey?: string;
    dueDate?: string;
    notes?: string;
    status: string;
    lines: Array<{ description: string; catalogItemKey?: string; quantity: number; unitPrice: number; taxRate?: number }>;
    payments: Array<{ amount: number; method: string; reference?: string; notes?: string }>;
  }>;
};

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async seedScenario(scenario: Scenario) {
    this.logger.log(`Seeding scenario: ${scenario}`);
    const config = scenario === 'restaurant'
      ? this.restaurantConfig()
      : this.clinicConfig();

    const existing = await this.prisma.tenant.findUnique({ where: { slug: config.slug } });
    if (existing) {
      this.logger.log(`Wiping existing tenant: ${existing.id}`);
      await this.wipeTenant(existing.id);
    }

    const tenant = await this.prisma.tenant.create({
      data: { name: config.name, slug: config.slug },
    });
    const tenantId = tenant.id;
    this.logger.log(`Tenant created: ${tenantId}`);

    // ── Departments ────────────────────────────────────────────────────────────
    const deptMap: Record<string, string> = {};
    for (const dept of config.departments) {
      const d = await this.prisma.department.create({
        data: { tenantId, name: dept.name, description: dept.description },
      });
      deptMap[dept.key] = d.id;

      for (let i = 0; i < dept.fields.length; i++) {
        const f = dept.fields[i];
        await this.prisma.fieldDefinition.create({
          data: { departmentId: d.id, key: f.key, label: f.label, type: f.type as any, required: false, sortOrder: i },
        });
      }
    }

    this.logger.log('Departments done');

    // ── Connections ────────────────────────────────────────────────────────────
    for (const conn of config.connections) {
      await this.prisma.departmentLink.create({
        data: { tenantId, fromDepartmentId: deptMap[conn.from], toDepartmentId: deptMap[conn.to], requiresApproval: conn.requiresApproval },
      });
    }

    this.logger.log('Connections done');

    // ── Suppliers ──────────────────────────────────────────────────────────────
    const supplierMap: Record<string, string> = {};
    for (const sup of config.suppliers) {
      const s = await this.prisma.supplier.create({
        data: { tenantId, name: sup.name, contactName: sup.contactName, contactEmail: sup.contactEmail, phone: sup.phone },
      });
      supplierMap[sup.key] = s.id;
    }

    this.logger.log('Suppliers done');

    // ── Inventory items ────────────────────────────────────────────────────────
    const itemMap: Record<string, string> = {};
    for (const item of config.items) {
      const deptId = deptMap[item.deptKey];
      const created = await this.prisma.item.create({
        data: { departmentId: deptId, name: item.name, sku: item.sku, attributes: item.attributes },
      });
      itemMap[item.key] = created.id;

      if (item.quantity > 0) {
        await this.inventory.recordMovement({
          tenantId, departmentId: deptId, itemId: created.id,
          quantityDelta: item.quantity, referenceType: 'INITIAL', createdByName: 'Demo Setup',
        });
      }
    }

    this.logger.log('Items done');

    // ── Completed transfers ────────────────────────────────────────────────────
    for (const t of config.completedTransfers) {
      const tr = await this.prisma.transferRequest.create({
        data: {
          tenantId,
          fromDepartmentId: deptMap[t.from],
          toDepartmentId: deptMap[t.to],
          status: 'COMPLETED',
          requestedByName: t.requestedBy,
          approvedByName: t.approvedBy,
          completedAt: new Date(Date.now() - t.hoursAgo * 3600000),
          lines: { create: t.lines.map((l) => ({ itemId: itemMap[l.itemKey], quantity: l.quantity })) },
        },
      });

      for (const l of t.lines) {
        await this.inventory.recordMovement({
          tenantId, departmentId: deptMap[t.from], itemId: itemMap[l.itemKey],
          quantityDelta: -l.quantity, referenceType: 'TRANSFER', referenceId: tr.id, createdByName: t.approvedBy,
        });

        const destItemName = config.items.find((i) => i.key === l.itemKey)!.name;
        let destItem = await this.prisma.item.findFirst({ where: { departmentId: deptMap[t.to], name: destItemName } });
        if (!destItem) {
          destItem = await this.prisma.item.create({ data: { departmentId: deptMap[t.to], name: destItemName, attributes: {} } });
        }

        await this.inventory.recordMovement({
          tenantId, departmentId: deptMap[t.to], itemId: destItem.id,
          quantityDelta: l.quantity, referenceType: 'TRANSFER', referenceId: tr.id, createdByName: t.approvedBy,
        });
      }
    }

    this.logger.log('Completed transfers done');

    // ── Pending transfer ───────────────────────────────────────────────────────
    if (config.pendingTransfer) {
      const pt = config.pendingTransfer;
      await this.prisma.transferRequest.create({
        data: {
          tenantId,
          fromDepartmentId: deptMap[pt.from],
          toDepartmentId: deptMap[pt.to],
          status: 'PENDING_APPROVAL',
          requestedByName: pt.requestedBy,
          lines: { create: pt.lines.map((l) => ({ itemId: itemMap[l.itemKey], quantity: l.quantity })) },
        },
      });
    }

    this.logger.log('Pending transfer done');

    // ── Purchase orders ────────────────────────────────────────────────────────
    if (config.approvedPO) {
      const apo = config.approvedPO;
      await this.prisma.purchaseOrder.create({
        data: {
          tenantId, supplierId: supplierMap[apo.supplierKey], departmentId: deptMap[apo.deptKey],
          status: 'APPROVED', requestedByName: apo.requestedBy, approvedByName: apo.approvedBy, notes: apo.notes,
          lines: { create: apo.lines.map((l) => ({ itemName: l.name, sku: l.sku, quantity: l.quantity, unitCost: l.unitCost })) },
        },
      });
    }

    if (config.pendingPO) {
      const ppo = config.pendingPO;
      await this.prisma.purchaseOrder.create({
        data: {
          tenantId, supplierId: supplierMap[ppo.supplierKey], departmentId: deptMap[ppo.deptKey],
          status: 'PENDING_APPROVAL', requestedByName: ppo.requestedBy, notes: ppo.notes,
          lines: { create: ppo.lines.map((l) => ({ itemName: l.name, sku: l.sku, quantity: l.quantity, unitCost: l.unitCost })) },
        },
      });
    }

    this.logger.log('Purchase orders done');

    // ── Entity types (modules) ─────────────────────────────────────────────────
    // recordRefMap: "entityTypeSlug:recordKey" → dbId (for resolving RELATION field values)
    const recordRefMap: Record<string, string> = {};

    for (const et of config.entityTypes) {
      const entityType = await this.prisma.entityType.create({
        data: { tenantId, name: et.name, slug: et.slug, description: et.description, icon: et.icon, roles: et.roles as Prisma.InputJsonValue },
      });

      for (let i = 0; i < et.fields.length; i++) {
        const f = et.fields[i];
        await this.prisma.entityField.create({
          data: {
            entityTypeId: entityType.id,
            key: f.key,
            label: f.label,
            fieldType: f.fieldType as any,
            required: f.required ?? false,
            config: f.config ? (f.config as Prisma.InputJsonValue) : undefined,
            sortOrder: i,
          },
        });
      }

      if (et.workflow) {
        await this.prisma.workflowDefinition.create({
          data: {
            entityTypeId: entityType.id,
            states: et.workflow.states as unknown as Prisma.InputJsonValue,
            transitions: et.workflow.transitions as unknown as Prisma.InputJsonValue,
          },
        });
      }

      // Resolve RELATION field values before creating records
      const relationFields = et.fields.filter((f) => f.fieldType === 'RELATION');

      for (const rec of et.records) {
        const resolvedAttributes: Record<string, unknown> = { ...rec.attributes };

        for (const rf of relationFields) {
          const refValue = resolvedAttributes[rf.key];
          if (typeof refValue === 'string' && refValue.includes(':')) {
            // Format: "entityTypeSlug:recordKey"
            resolvedAttributes[rf.key] = recordRefMap[refValue] ?? refValue;
          }
        }

        const created = await this.prisma.entityRecord.create({
          data: {
            tenantId,
            entityTypeId: entityType.id,
            attributes: resolvedAttributes as Prisma.InputJsonValue,
          },
        });

        recordRefMap[`${et.slug}:${rec.key}`] = created.id;

        if (et.workflow && rec.initialState) {
          await this.prisma.workflowInstance.create({
            data: { entityRecordId: created.id, currentState: rec.initialState },
          });
        }
      }
    }

    this.logger.log('Entity types done');

    // ── Revenue Engine ─────────────────────────────────────────────────────────
    if (config.revenueEngine) {
      const re = config.revenueEngine;

      const taxRateMap: Record<string, string> = {};
      for (const tr of re.taxRates) {
        const created = await this.prisma.taxRate.create({ data: { tenantId, name: tr.name, rate: tr.rate, isDefault: tr.isDefault ?? false } });
        taxRateMap[tr.name] = created.id;
      }

      const catalogMap: Record<string, string> = {};
      for (const ci of re.catalogItems) {
        const created = await this.prisma.catalogItem.create({
          data: {
            tenantId, name: ci.name, sku: ci.sku, sellingPrice: ci.sellingPrice,
            costPrice: ci.costPrice ?? 0, unit: ci.unit,
            taxRateId: ci.taxRateKey ? taxRateMap[ci.taxRateKey] : undefined,
          },
        });
        catalogMap[ci.key] = created.id;
      }

      const customerMap: Record<string, string> = {};
      for (const cu of re.customers) {
        const created = await this.prisma.customer.create({
          data: { tenantId, name: cu.name, email: cu.email, phone: cu.phone, address: cu.address, notes: cu.notes },
        });
        customerMap[cu.key] = created.id;
      }

      const saleOrderMap: Record<string, string> = {};
      for (let i = 0; i < re.saleOrders.length; i++) {
        const so = re.saleOrders[i];
        const created = await this.prisma.saleOrder.create({
          data: {
            tenantId, customerId: customerMap[so.customerKey], reference: so.reference,
            status: so.status as any, notes: so.notes,
            lines: { create: so.lines.map((l) => ({ catalogItemId: catalogMap[l.catalogItemKey], quantity: l.quantity, unitPrice: l.unitPrice, discount: 0 })) },
          },
        });
        saleOrderMap[`order_${i}`] = created.id;
      }

      let invoiceCounter = 1;
      for (let i = 0; i < re.invoices.length; i++) {
        const inv = re.invoices[i];
        let subtotal = 0, taxAmount = 0;
        const computedLines = inv.lines.map((l) => {
          const base = l.quantity * l.unitPrice;
          const tax = base * ((l.taxRate ?? 0) / 100);
          subtotal += base; taxAmount += tax;
          return { ...l, lineTotal: base + tax };
        });
        const total = subtotal + taxAmount;
        const invoiceNumber = `INV-${String(invoiceCounter++).padStart(4, '0')}`;

        const paidAmount = inv.payments.reduce((s, p) => s + p.amount, 0);
        const invoiceStatus = inv.status === 'PAID' && paidAmount >= total ? 'PAID'
          : paidAmount > 0 ? 'PARTIALLY_PAID'
          : inv.status;

        const created = await this.prisma.invoice.create({
          data: {
            tenantId, invoiceNumber, customerId: customerMap[inv.customerKey],
            saleOrderId: inv.saleOrderKey ? saleOrderMap[inv.saleOrderKey] : undefined,
            dueDate: inv.dueDate ? new Date(inv.dueDate) : undefined,
            notes: inv.notes, discount: 0, subtotal, taxAmount, total,
            paidAmount, status: invoiceStatus as any,
            lines: {
              create: computedLines.map((l) => ({
                catalogItemId: l.catalogItemKey ? catalogMap[l.catalogItemKey] : undefined,
                description: l.description, quantity: l.quantity, unitPrice: l.unitPrice,
                taxRate: l.taxRate ?? 0, discount: 0, lineTotal: l.lineTotal,
              })),
            },
          },
        });

        for (const p of inv.payments) {
          await this.prisma.payment.create({
            data: {
              tenantId, invoiceId: created.id, amount: p.amount,
              method: p.method as any, reference: p.reference, notes: p.notes,
            },
          });
        }
      }
    }

    this.logger.log('Revenue engine done');

    await this.prisma.domainEvent.create({
      data: { tenantId, type: 'demo.seeded', actorName: 'System', payload: { scenario } },
    });

    this.logger.log(`Seed complete: ${config.slug}`);
    return { tenantSlug: config.slug, tenantName: config.name };
  }

  private async wipeTenant(tenantId: string) {
    await this.prisma.$transaction([
      this.prisma.domainEvent.deleteMany({ where: { tenantId } }),
      this.prisma.workflowEvent.deleteMany({ where: { workflowInstance: { entityRecord: { tenantId } } } }),
      this.prisma.workflowInstance.deleteMany({ where: { entityRecord: { tenantId } } }),
      this.prisma.entityRecord.deleteMany({ where: { tenantId } }),
      this.prisma.workflowDefinition.deleteMany({ where: { entityType: { tenantId } } }),
      this.prisma.entityField.deleteMany({ where: { entityType: { tenantId } } }),
      this.prisma.entityType.deleteMany({ where: { tenantId } }),
      this.prisma.pOLine.deleteMany({ where: { purchaseOrder: { tenantId } } }),
      this.prisma.purchaseOrder.deleteMany({ where: { tenantId } }),
      this.prisma.transferLine.deleteMany({ where: { transferRequest: { tenantId } } }),
      this.prisma.transferRequest.deleteMany({ where: { tenantId } }),
      this.prisma.inventoryMovement.deleteMany({ where: { tenantId } }),
      this.prisma.item.deleteMany({ where: { department: { tenantId } } }),
      this.prisma.fieldDefinition.deleteMany({ where: { department: { tenantId } } }),
      this.prisma.departmentLink.deleteMany({ where: { tenantId } }),
      this.prisma.supplier.deleteMany({ where: { tenantId } }),
      // Revenue Engine — delete in FK dependency order
      this.prisma.payment.deleteMany({ where: { tenantId } }),
      this.prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId } } }),
      this.prisma.invoice.deleteMany({ where: { tenantId } }),
      this.prisma.saleOrderLine.deleteMany({ where: { saleOrder: { tenantId } } }),
      this.prisma.saleOrder.deleteMany({ where: { tenantId } }),
      this.prisma.catalogItem.deleteMany({ where: { tenantId } }),
      this.prisma.taxRate.deleteMany({ where: { tenantId } }),
      this.prisma.customer.deleteMany({ where: { tenantId } }),
      this.prisma.user.deleteMany({ where: { tenantId } }),
      this.prisma.department.deleteMany({ where: { tenantId } }),
      this.prisma.tenant.delete({ where: { id: tenantId } }),
    ]);
  }

  private restaurantConfig() {
    const entityTypes: EntityTypeSeed[] = [
      {
        key: 'customer',
        name: 'Customer',
        slug: 'customer',
        description: 'Guests and regular customers',
        icon: 'Users',
        roles: ['admin', 'manager'],
        fields: [
          { key: 'name', label: 'Full Name', fieldType: 'TEXT', required: true },
          { key: 'email', label: 'Email', fieldType: 'TEXT' },
          { key: 'phone', label: 'Phone', fieldType: 'TEXT' },
          { key: 'notes', label: 'Notes', fieldType: 'TEXT' },
        ],
        workflow: null,
        records: [
          { key: 'sophie', attributes: { name: 'Sophie Williams', email: 'sophie@example.com', phone: '07700 900001', notes: 'Regular Thursday lunch' }, initialState: null },
          { key: 'james', attributes: { name: 'James Patel', email: 'james@example.com', phone: '07700 900002', notes: 'Allergy: nuts' }, initialState: null },
          { key: 'amara', attributes: { name: 'Amara Osei', email: 'amara@example.com', phone: '07700 900003', notes: 'Celebrates birthday in July' }, initialState: null },
        ],
      },
      {
        key: 'reservation',
        name: 'Reservation',
        slug: 'reservation',
        description: 'Table bookings and walk-ins',
        icon: 'ClipboardCheck',
        roles: ['admin', 'manager', 'staff'],
        fields: [
          { key: 'customer', label: 'Customer', fieldType: 'RELATION', required: true, config: { targetEntityTypeSlug: 'customer', targetEntityTypeName: 'Customer' } },
          { key: 'date', label: 'Date', fieldType: 'DATE', required: true },
          { key: 'party_size', label: 'Party Size', fieldType: 'NUMBER', required: true },
          { key: 'table', label: 'Table Number', fieldType: 'TEXT' },
          { key: 'special_requests', label: 'Special Requests', fieldType: 'TEXT' },
        ],
        workflow: {
          states: [
            { id: 'pending', label: 'Pending', initial: true, color: 'amber' },
            { id: 'confirmed', label: 'Confirmed', color: 'blue' },
            { id: 'seated', label: 'Seated', color: 'purple' },
            { id: 'completed', label: 'Completed', terminal: true, color: 'emerald' },
            { id: 'cancelled', label: 'Cancelled', terminal: true, color: 'red' },
          ],
          transitions: [
            { id: 'confirm', from: 'pending', to: 'confirmed', label: 'Confirm' },
            { id: 'seat', from: 'confirmed', to: 'seated', label: 'Seat guests' },
            { id: 'complete', from: 'seated', to: 'completed', label: 'Complete' },
            { id: 'cancel_pending', from: 'pending', to: 'cancelled', label: 'Cancel', requiresApproval: true },
            { id: 'cancel_confirmed', from: 'confirmed', to: 'cancelled', label: 'Cancel', requiresApproval: true },
          ],
        },
        records: [
          { key: 'res1', attributes: { customer: 'customer:sophie', date: '2026-06-07', party_size: 4, table: 'T3', special_requests: 'Window seat preferred' }, initialState: 'confirmed' },
          { key: 'res2', attributes: { customer: 'customer:james', date: '2026-06-07', party_size: 2, table: '', special_requests: 'Nut allergy — alert kitchen' }, initialState: 'pending' },
          { key: 'res3', attributes: { customer: 'customer:amara', date: '2026-06-05', party_size: 6, table: 'T7', special_requests: '' }, initialState: 'completed' },
        ],
      },
    ];

    return {
      slug: 'riverside-restaurant',
      name: 'Riverside Restaurant',
      departments: [
        {
          key: 'stores', name: 'Central Stores', description: 'Main stockroom — receives all deliveries',
          fields: [
            { key: 'supplier', label: 'Supplier', type: 'TEXT' },
            { key: 'unit_cost', label: 'Unit Cost (£)', type: 'NUMBER' },
            { key: 'reorder_level', label: 'Reorder Level', type: 'NUMBER' },
            { key: 'expiry_date', label: 'Expiry Date', type: 'DATE' },
          ],
        },
        {
          key: 'kitchen', name: 'Kitchen', description: 'Food preparation and cooking',
          fields: [
            { key: 'reorder_level', label: 'Reorder Level', type: 'NUMBER' },
            { key: 'expiry_date', label: 'Expiry Date', type: 'DATE' },
          ],
        },
        {
          key: 'bar', name: 'Bar', description: 'Drinks and beverages',
          fields: [
            { key: 'unit_cost', label: 'Unit Cost (£)', type: 'NUMBER' },
            { key: 'reorder_level', label: 'Reorder Level', type: 'NUMBER' },
          ],
        },
      ],
      connections: [
        { from: 'stores', to: 'kitchen', requiresApproval: true },
        { from: 'stores', to: 'bar', requiresApproval: true },
      ],
      suppliers: [
        { key: 'fresh', name: 'Fresh Direct Ltd', contactName: 'Tom Walsh', contactEmail: 'orders@freshdirect.co.uk', phone: '020 7946 0101' },
        { key: 'metro', name: 'Metro Wholesale', contactName: 'Sarah Hill', contactEmail: 'sales@metrowholesale.co.uk', phone: '020 7946 0202' },
      ],
      items: [
        { key: 'chicken', deptKey: 'stores', name: 'Chicken Breast', sku: 'CHK-001', quantity: 50, attributes: { supplier: 'Fresh Direct Ltd', unit_cost: 4.50, reorder_level: 20 } },
        { key: 'tomatoes', deptKey: 'stores', name: 'Tomatoes (kg)', sku: 'TOM-001', quantity: 8, attributes: { supplier: 'Fresh Direct Ltd', unit_cost: 1.20, reorder_level: 15 } },
        { key: 'pasta', deptKey: 'stores', name: 'Pasta (500g)', sku: 'PAS-001', quantity: 30, attributes: { supplier: 'Metro Wholesale', unit_cost: 0.80, reorder_level: 10 } },
        { key: 'vodka', deptKey: 'stores', name: 'Vodka (700ml)', sku: 'VOD-001', quantity: 20, attributes: { unit_cost: 12.00, reorder_level: 6 } },
        { key: 'wine', deptKey: 'stores', name: 'House Red Wine', sku: 'WIN-001', quantity: 30, attributes: { unit_cost: 6.50, reorder_level: 10 } },
        { key: 'oil', deptKey: 'stores', name: 'Olive Oil (1L)', sku: 'OIL-001', quantity: 6, attributes: { unit_cost: 3.20, reorder_level: 8 } },
      ],
      completedTransfers: [
        { from: 'stores', to: 'kitchen', requestedBy: 'Chef Marco', approvedBy: 'Manager Sara', hoursAgo: 48, lines: [{ itemKey: 'chicken', quantity: 10 }, { itemKey: 'pasta', quantity: 6 }] },
        { from: 'stores', to: 'bar', requestedBy: 'Bartender Liam', approvedBy: 'Manager Sara', hoursAgo: 24, lines: [{ itemKey: 'vodka', quantity: 6 }, { itemKey: 'wine', quantity: 8 }] },
      ],
      pendingTransfer: { from: 'stores', to: 'kitchen', requestedBy: 'Chef Marco', lines: [{ itemKey: 'tomatoes', quantity: 5 }, { itemKey: 'oil', quantity: 2 }] },
      approvedPO: {
        supplierKey: 'fresh', deptKey: 'stores', requestedBy: 'Manager Sara', approvedBy: 'Admin David',
        notes: 'Weekly fresh produce order',
        lines: [{ name: 'Chicken Breast', sku: 'CHK-001', quantity: 30, unitCost: 4.50 }, { name: 'Tomatoes (kg)', sku: 'TOM-001', quantity: 20, unitCost: 1.20 }],
      },
      pendingPO: {
        supplierKey: 'metro', deptKey: 'stores', requestedBy: 'Manager Sara',
        notes: 'Dry goods restock',
        lines: [{ name: 'Pasta (500g)', sku: 'PAS-001', quantity: 48, unitCost: 0.80 }, { name: 'Olive Oil (1L)', sku: 'OIL-001', quantity: 12, unitCost: 3.20 }],
      },
      entityTypes,
      revenueEngine: {
        taxRates: [
          { name: 'VAT 20%', rate: 20, isDefault: true },
          { name: 'Zero-rated', rate: 0 },
        ],
        catalogItems: [
          { key: 'salmon', name: 'Grilled Salmon', sku: 'FOOD-001', sellingPrice: 18.50, costPrice: 7.00, unit: 'portion', taxRateKey: 'VAT 20%' },
          { key: 'chicken_pasta', name: 'Chicken Pasta', sku: 'FOOD-002', sellingPrice: 14.00, costPrice: 4.50, unit: 'portion', taxRateKey: 'VAT 20%' },
          { key: 'steak', name: 'Ribeye Steak', sku: 'FOOD-003', sellingPrice: 26.00, costPrice: 10.00, unit: 'portion', taxRateKey: 'VAT 20%' },
          { key: 'red_wine', name: 'House Red Wine (bottle)', sku: 'DRK-001', sellingPrice: 22.00, costPrice: 6.50, unit: 'bottle', taxRateKey: 'VAT 20%' },
          { key: 'still_water', name: 'Still Water (500ml)', sku: 'DRK-002', sellingPrice: 3.50, costPrice: 0.50, unit: 'bottle', taxRateKey: 'VAT 20%' },
          { key: 'dessert', name: 'Chocolate Fondant', sku: 'FOOD-004', sellingPrice: 7.50, costPrice: 2.00, unit: 'portion', taxRateKey: 'VAT 20%' },
        ],
        customers: [
          { key: 'emma', name: 'Emma Thompson', email: 'emma.thompson@hartley-corp.co.uk', phone: '07700 900501', address: '12 Hartley Place, London, EC2A 1NT', notes: 'Monthly corporate dinner account' },
          { key: 'lawson', name: 'Lawson Group Ltd', email: 'accounts@lawsongroup.co.uk', phone: '020 7946 0601', address: '55 Cannon Street, London, EC4N 6AP', notes: 'Quarterly events client — invoice on 30-day terms' },
          { key: 'oliver', name: 'Oliver Nash', email: 'oliver.nash@gmail.com', phone: '07700 900502', address: '3 Riverside Walk, London, SE1 7PB', notes: 'Regular weekend guest' },
        ],
        saleOrders: [
          {
            customerKey: 'lawson', reference: 'EVT-2026-Q2', status: 'INVOICED', notes: 'Q2 corporate dinner — 8 guests',
            lines: [
              { catalogItemKey: 'salmon', quantity: 3, unitPrice: 18.50 },
              { catalogItemKey: 'steak', quantity: 2, unitPrice: 26.00 },
              { catalogItemKey: 'chicken_pasta', quantity: 3, unitPrice: 14.00 },
              { catalogItemKey: 'red_wine', quantity: 3, unitPrice: 22.00 },
            ],
          },
          {
            customerKey: 'emma', reference: 'TBL-042', status: 'CONFIRMED', notes: 'Table booking — lunch for 2',
            lines: [
              { catalogItemKey: 'salmon', quantity: 1, unitPrice: 18.50 },
              { catalogItemKey: 'chicken_pasta', quantity: 1, unitPrice: 14.00 },
              { catalogItemKey: 'still_water', quantity: 2, unitPrice: 3.50 },
            ],
          },
          {
            customerKey: 'oliver', reference: 'TBL-051', status: 'DRAFT', notes: 'Saturday dinner — awaiting confirmation',
            lines: [
              { catalogItemKey: 'steak', quantity: 1, unitPrice: 26.00 },
              { catalogItemKey: 'red_wine', quantity: 1, unitPrice: 22.00 },
              { catalogItemKey: 'dessert', quantity: 1, unitPrice: 7.50 },
            ],
          },
        ],
        invoices: [
          {
            customerKey: 'lawson', saleOrderKey: 'order_0', status: 'PAID',
            dueDate: '2026-06-15', notes: 'Q2 corporate dinner — 30-day terms',
            lines: [
              { catalogItemKey: 'salmon', description: 'Grilled Salmon × 3', quantity: 3, unitPrice: 18.50, taxRate: 20 },
              { catalogItemKey: 'steak', description: 'Ribeye Steak × 2', quantity: 2, unitPrice: 26.00, taxRate: 20 },
              { catalogItemKey: 'chicken_pasta', description: 'Chicken Pasta × 3', quantity: 3, unitPrice: 14.00, taxRate: 20 },
              { catalogItemKey: 'red_wine', description: 'House Red Wine × 3', quantity: 3, unitPrice: 22.00, taxRate: 20 },
            ],
            payments: [{ amount: 241.20, method: 'BANK_TRANSFER', reference: 'BACS-20260601', notes: 'Full settlement' }],
          },
          {
            customerKey: 'emma', status: 'SENT',
            dueDate: '2026-06-20', notes: 'Monthly account — May dining',
            lines: [
              { description: 'May dining — 3 visits', quantity: 1, unitPrice: 95.00, taxRate: 20 },
            ],
            payments: [{ amount: 50.00, method: 'BANK_TRANSFER', reference: 'BACS-20260605', notes: 'Partial payment' }],
          },
        ],
      } as RevenueEngineSeed,
    };
  }

  private clinicConfig() {
    const entityTypes: EntityTypeSeed[] = [
      {
        key: 'patient',
        name: 'Patient',
        slug: 'patient',
        description: 'Registered patients at the clinic',
        icon: 'Users',
        roles: ['admin', 'manager'],
        fields: [
          { key: 'name', label: 'Full Name', fieldType: 'TEXT', required: true },
          { key: 'dob', label: 'Date of Birth', fieldType: 'DATE' },
          { key: 'contact', label: 'Contact Number', fieldType: 'TEXT' },
          { key: 'medical_record_number', label: 'Medical Record No.', fieldType: 'TEXT' },
          { key: 'notes', label: 'Clinical Notes', fieldType: 'TEXT' },
        ],
        workflow: null,
        records: [
          { key: 'eleanor', attributes: { name: 'Eleanor Voss', dob: '1978-03-14', contact: '07700 900101', medical_record_number: 'MRN-0041', notes: 'Hypertension, annual review due' }, initialState: null },
          { key: 'marcus', attributes: { name: 'Marcus Obi', dob: '1992-11-05', contact: '07700 900102', medical_record_number: 'MRN-0042', notes: 'Diabetic — monitor HbA1c' }, initialState: null },
          { key: 'priya', attributes: { name: 'Priya Sharma', dob: '1965-07-22', contact: '07700 900103', medical_record_number: 'MRN-0043', notes: '' }, initialState: null },
        ],
      },
      {
        key: 'appointment',
        name: 'Appointment',
        slug: 'appointment',
        description: 'Patient appointments and consultations',
        icon: 'Stethoscope',
        roles: ['admin', 'manager', 'staff'],
        fields: [
          { key: 'patient', label: 'Patient', fieldType: 'RELATION', required: true, config: { targetEntityTypeSlug: 'patient', targetEntityTypeName: 'Patient' } },
          { key: 'date', label: 'Date', fieldType: 'DATE', required: true },
          { key: 'time', label: 'Time', fieldType: 'TEXT' },
          { key: 'doctor', label: 'Doctor', fieldType: 'TEXT' },
          { key: 'type', label: 'Appointment Type', fieldType: 'SELECT', config: { options: ['Consultation', 'Follow-up', 'Procedure', 'Emergency'] } },
        ],
        workflow: {
          states: [
            { id: 'scheduled', label: 'Scheduled', initial: true, color: 'blue' },
            { id: 'checked_in', label: 'Checked In', color: 'amber' },
            { id: 'in_progress', label: 'In Progress', color: 'purple' },
            { id: 'completed', label: 'Completed', terminal: true, color: 'emerald' },
            { id: 'cancelled', label: 'Cancelled', terminal: true, color: 'red' },
          ],
          transitions: [
            { id: 'check_in', from: 'scheduled', to: 'checked_in', label: 'Check in' },
            { id: 'start', from: 'checked_in', to: 'in_progress', label: 'Start consultation' },
            { id: 'complete', from: 'in_progress', to: 'completed', label: 'Complete' },
            { id: 'cancel', from: 'scheduled', to: 'cancelled', label: 'Cancel', requiresApproval: true },
          ],
        },
        records: [
          { key: 'appt1', attributes: { patient: 'patient:eleanor', date: '2026-06-07', time: '09:30', doctor: 'Dr. Williams', type: 'Follow-up' }, initialState: 'scheduled' },
          { key: 'appt2', attributes: { patient: 'patient:marcus', date: '2026-06-07', time: '10:15', doctor: 'Dr. Chen', type: 'Consultation' }, initialState: 'checked_in' },
          { key: 'appt3', attributes: { patient: 'patient:priya', date: '2026-06-04', time: '14:00', doctor: 'Dr. Williams', type: 'Procedure' }, initialState: 'completed' },
        ],
      },
    ];

    return {
      slug: 'city-clinic',
      name: 'City Clinic',
      departments: [
        {
          key: 'stores', name: 'General Supplies', description: 'Central medical supplies store',
          fields: [
            { key: 'supplier', label: 'Supplier', type: 'TEXT' },
            { key: 'unit_cost', label: 'Unit Cost (£)', type: 'NUMBER' },
            { key: 'reorder_level', label: 'Reorder Level', type: 'NUMBER' },
          ],
        },
        {
          key: 'pharmacy', name: 'Pharmacy', description: 'Medication dispensing',
          fields: [
            { key: 'batch_number', label: 'Batch Number', type: 'TEXT' },
            { key: 'expiry_date', label: 'Expiry Date', type: 'DATE' },
            { key: 'dosage', label: 'Dosage', type: 'TEXT' },
            { key: 'reorder_level', label: 'Reorder Level', type: 'NUMBER' },
          ],
        },
        {
          key: 'treatment', name: 'Treatment Room', description: 'Clinical treatment supplies',
          fields: [
            { key: 'reorder_level', label: 'Reorder Level', type: 'NUMBER' },
            { key: 'expiry_date', label: 'Expiry Date', type: 'DATE' },
          ],
        },
      ],
      connections: [
        { from: 'stores', to: 'pharmacy', requiresApproval: true },
        { from: 'stores', to: 'treatment', requiresApproval: false },
      ],
      suppliers: [
        { key: 'medsupply', name: 'MedSupply Co', contactName: 'Dr. Chen', contactEmail: 'orders@medsupply.co.uk', phone: '020 7946 0303' },
        { key: 'pharma', name: 'PharmaDirect', contactName: 'Anita Patel', contactEmail: 'sales@pharmadirect.co.uk', phone: '020 7946 0404' },
      ],
      items: [
        { key: 'paracetamol', deptKey: 'stores', name: 'Paracetamol 500mg (x100)', sku: 'MED-PAR-001', quantity: 30, attributes: { supplier: 'PharmaDirect', unit_cost: 2.40, reorder_level: 40 } },
        { key: 'amoxicillin', deptKey: 'stores', name: 'Amoxicillin 250mg (x21)', sku: 'MED-AMX-001', quantity: 15, attributes: { supplier: 'PharmaDirect', unit_cost: 5.80, reorder_level: 20 } },
        { key: 'bandages', deptKey: 'stores', name: 'Bandages (box of 10)', sku: 'SUP-BND-001', quantity: 25, attributes: { supplier: 'MedSupply Co', unit_cost: 3.50, reorder_level: 15 } },
        { key: 'gloves', deptKey: 'stores', name: 'Latex Gloves (box of 100)', sku: 'SUP-GLV-001', quantity: 12, attributes: { supplier: 'MedSupply Co', unit_cost: 8.00, reorder_level: 10 } },
      ],
      completedTransfers: [
        { from: 'stores', to: 'pharmacy', requestedBy: 'Pharmacist Priya', approvedBy: 'Dr. Williams', hoursAgo: 72, lines: [{ itemKey: 'paracetamol', quantity: 10 }] },
        { from: 'stores', to: 'treatment', requestedBy: 'Nurse Adams', approvedBy: 'System (auto-approved)', hoursAgo: 36, lines: [{ itemKey: 'bandages', quantity: 5 }, { itemKey: 'gloves', quantity: 3 }] },
      ],
      pendingTransfer: { from: 'stores', to: 'pharmacy', requestedBy: 'Pharmacist Priya', lines: [{ itemKey: 'amoxicillin', quantity: 5 }] },
      approvedPO: {
        supplierKey: 'pharma', deptKey: 'stores', requestedBy: 'Dr. Williams', approvedBy: 'Admin Johnson',
        notes: 'Monthly medication restock',
        lines: [{ name: 'Paracetamol 500mg (x100)', sku: 'MED-PAR-001', quantity: 40, unitCost: 2.40 }, { name: 'Amoxicillin 250mg (x21)', sku: 'MED-AMX-001', quantity: 20, unitCost: 5.80 }],
      },
      pendingPO: {
        supplierKey: 'medsupply', deptKey: 'stores', requestedBy: 'Nurse Adams',
        notes: 'Clinical supplies replenishment',
        lines: [{ name: 'Bandages (box of 10)', sku: 'SUP-BND-001', quantity: 20, unitCost: 3.50 }, { name: 'Latex Gloves (box of 100)', sku: 'SUP-GLV-001', quantity: 15, unitCost: 8.00 }],
      },
      entityTypes,
      revenueEngine: {
        taxRates: [
          { name: 'VAT 20%', rate: 20, isDefault: true },
          { name: 'Zero-rated', rate: 0 },
        ],
        catalogItems: [
          { key: 'gp_consult', name: 'GP Consultation', sku: 'SVC-001', sellingPrice: 60.00, costPrice: 0, unit: 'session', taxRateKey: 'Zero-rated' },
          { key: 'follow_up', name: 'Follow-up Appointment', sku: 'SVC-002', sellingPrice: 40.00, costPrice: 0, unit: 'session', taxRateKey: 'Zero-rated' },
          { key: 'blood_test', name: 'Blood Test', sku: 'SVC-003', sellingPrice: 35.00, costPrice: 8.00, unit: 'test', taxRateKey: 'Zero-rated' },
          { key: 'procedure', name: 'Minor Procedure', sku: 'SVC-004', sellingPrice: 120.00, costPrice: 20.00, unit: 'session', taxRateKey: 'Zero-rated' },
          { key: 'prescription', name: 'Prescription Fee', sku: 'SVC-005', sellingPrice: 9.90, costPrice: 0, unit: 'item', taxRateKey: 'Zero-rated' },
          { key: 'xray', name: 'X-Ray', sku: 'SVC-006', sellingPrice: 85.00, costPrice: 15.00, unit: 'scan', taxRateKey: 'Zero-rated' },
        ],
        customers: [
          { key: 'eleanor', name: 'Eleanor Voss', email: 'eleanor.voss@email.co.uk', phone: '07700 900101', address: '14 Oakfield Road, Manchester, M21 9JT', notes: 'NHS + private top-up account' },
          { key: 'marcus', name: 'Marcus Obi', email: 'marcus.obi@email.co.uk', phone: '07700 900102', address: '88 Lime Street, Liverpool, L1 1JQ', notes: 'Diabetic — regular quarterly reviews' },
          { key: 'hartfield', name: 'Hartfield Insurance Ltd', email: 'claims@hartfield-insurance.co.uk', phone: '020 7946 0801', address: '32 Bishopsgate, London, EC2N 4AJ', notes: 'Corporate insurer — 30-day invoice terms' },
        ],
        saleOrders: [
          {
            customerKey: 'hartfield', reference: 'CORP-2026-05', status: 'INVOICED', notes: 'May corporate health plan — 4 employees',
            lines: [
              { catalogItemKey: 'gp_consult', quantity: 4, unitPrice: 60.00 },
              { catalogItemKey: 'blood_test', quantity: 4, unitPrice: 35.00 },
            ],
          },
          {
            customerKey: 'eleanor', reference: 'APT-0041', status: 'CONFIRMED', notes: 'Annual review + blood panel',
            lines: [
              { catalogItemKey: 'gp_consult', quantity: 1, unitPrice: 60.00 },
              { catalogItemKey: 'blood_test', quantity: 1, unitPrice: 35.00 },
            ],
          },
          {
            customerKey: 'marcus', reference: 'APT-0042', status: 'DRAFT', notes: 'HbA1c test + follow-up',
            lines: [
              { catalogItemKey: 'blood_test', quantity: 1, unitPrice: 35.00 },
              { catalogItemKey: 'follow_up', quantity: 1, unitPrice: 40.00 },
            ],
          },
        ],
        invoices: [
          {
            customerKey: 'hartfield', saleOrderKey: 'order_0', status: 'PAID',
            dueDate: '2026-06-15', notes: 'May corporate health plan — Hartfield Insurance',
            lines: [
              { catalogItemKey: 'gp_consult', description: 'GP Consultation × 4', quantity: 4, unitPrice: 60.00, taxRate: 0 },
              { catalogItemKey: 'blood_test', description: 'Blood Test × 4', quantity: 4, unitPrice: 35.00, taxRate: 0 },
            ],
            payments: [{ amount: 380.00, method: 'BANK_TRANSFER', reference: 'BACS-20260602', notes: 'Full settlement — Hartfield Insurance' }],
          },
          {
            customerKey: 'eleanor', status: 'SENT',
            dueDate: '2026-06-25', notes: 'Annual review visit — May 2026',
            lines: [
              { catalogItemKey: 'gp_consult', description: 'GP Consultation', quantity: 1, unitPrice: 60.00, taxRate: 0 },
              { catalogItemKey: 'blood_test', description: 'Blood Test', quantity: 1, unitPrice: 35.00, taxRate: 0 },
            ],
            payments: [],
          },
        ],
      } as RevenueEngineSeed,
    };
  }
}
