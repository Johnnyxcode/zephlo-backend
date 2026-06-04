import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

type Scenario = 'restaurant' | 'clinic';

@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async seedScenario(scenario: Scenario) {
    const config = scenario === 'restaurant'
      ? this.restaurantConfig()
      : this.clinicConfig();

    // Wipe existing tenant with same slug
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: config.slug },
    });
    if (existing) {
      await this.wipeTenant(existing.id);
    }

    // Create tenant
    const tenant = await this.prisma.tenant.create({
      data: { name: config.name, slug: config.slug },
    });
    const tenantId = tenant.id;

    // Create departments
    const deptMap: Record<string, string> = {};
    for (const dept of config.departments) {
      const d = await this.prisma.department.create({
        data: { tenantId, name: dept.name, description: dept.description },
      });
      deptMap[dept.key] = d.id;

      for (let i = 0; i < dept.fields.length; i++) {
        const f = dept.fields[i];
        await this.prisma.fieldDefinition.create({
          data: {
            departmentId: d.id,
            key: f.key,
            label: f.label,
            type: f.type as any,
            required: false,
            sortOrder: i,
          },
        });
      }
    }

    // Create connections
    for (const conn of config.connections) {
      await this.prisma.departmentLink.create({
        data: {
          tenantId,
          fromDepartmentId: deptMap[conn.from],
          toDepartmentId: deptMap[conn.to],
          requiresApproval: conn.requiresApproval,
        },
      });
    }

    // Create suppliers
    const supplierMap: Record<string, string> = {};
    for (const sup of config.suppliers) {
      const s = await this.prisma.supplier.create({
        data: {
          tenantId,
          name: sup.name,
          contactName: sup.contactName,
          contactEmail: sup.contactEmail,
          phone: sup.phone,
        },
      });
      supplierMap[sup.key] = s.id;
    }

    // Create items with initial stock
    const itemMap: Record<string, string> = {};
    for (const item of config.items) {
      const deptId = deptMap[item.deptKey];
      const created = await this.prisma.item.create({
        data: {
          departmentId: deptId,
          name: item.name,
          sku: item.sku,
          attributes: item.attributes,
        },
      });
      itemMap[item.key] = created.id;

      if (item.quantity > 0) {
        await this.inventory.recordMovement({
          tenantId,
          departmentId: deptId,
          itemId: created.id,
          quantityDelta: item.quantity,
          referenceType: 'INITIAL',
          createdByName: 'Demo Setup',
        });
      }
    }

    // Create completed transfers (historical data)
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
          lines: {
            create: t.lines.map((l) => ({
              itemId: itemMap[l.itemKey],
              quantity: l.quantity,
            })),
          },
        },
      });

      for (const l of t.lines) {
        await this.inventory.recordMovement({
          tenantId,
          departmentId: deptMap[t.from],
          itemId: itemMap[l.itemKey],
          quantityDelta: -l.quantity,
          referenceType: 'TRANSFER',
          referenceId: tr.id,
          createdByName: t.approvedBy,
        });

        const destItemName = config.items.find(i => i.key === l.itemKey)!.name;
        let destItem = await this.prisma.item.findFirst({
          where: { departmentId: deptMap[t.to], name: destItemName },
        });
        if (!destItem) {
          destItem = await this.prisma.item.create({
            data: { departmentId: deptMap[t.to], name: destItemName, attributes: {} },
          });
        }

        await this.inventory.recordMovement({
          tenantId,
          departmentId: deptMap[t.to],
          itemId: destItem.id,
          quantityDelta: l.quantity,
          referenceType: 'TRANSFER',
          referenceId: tr.id,
          createdByName: t.approvedBy,
        });
      }
    }

    // Create pending transfer (shows approvals queue)
    if (config.pendingTransfer) {
      const pt = config.pendingTransfer;
      await this.prisma.transferRequest.create({
        data: {
          tenantId,
          fromDepartmentId: deptMap[pt.from],
          toDepartmentId: deptMap[pt.to],
          status: 'PENDING_APPROVAL',
          requestedByName: pt.requestedBy,
          lines: {
            create: pt.lines.map((l) => ({
              itemId: itemMap[l.itemKey],
              quantity: l.quantity,
            })),
          },
        },
      });
    }

    // Create approved PO (shows PO workflow mid-flow)
    if (config.approvedPO) {
      const apo = config.approvedPO;
      await this.prisma.purchaseOrder.create({
        data: {
          tenantId,
          supplierId: supplierMap[apo.supplierKey],
          departmentId: deptMap[apo.deptKey],
          status: 'APPROVED',
          requestedByName: apo.requestedBy,
          approvedByName: apo.approvedBy,
          notes: apo.notes,
          lines: { create: apo.lines.map((l) => ({ itemName: l.name, sku: l.sku, quantity: l.quantity, unitCost: l.unitCost })) },
        },
      });
    }

    // Create pending PO (shows approvals queue)
    if (config.pendingPO) {
      const ppo = config.pendingPO;
      await this.prisma.purchaseOrder.create({
        data: {
          tenantId,
          supplierId: supplierMap[ppo.supplierKey],
          departmentId: deptMap[ppo.deptKey],
          status: 'PENDING_APPROVAL',
          requestedByName: ppo.requestedBy,
          notes: ppo.notes,
          lines: { create: ppo.lines.map((l) => ({ itemName: l.name, sku: l.sku, quantity: l.quantity, unitCost: l.unitCost })) },
        },
      });
    }

    await this.prisma.domainEvent.create({
      data: { tenantId, type: 'demo.seeded', actorName: 'System', payload: { scenario } },
    });

    return { tenantSlug: config.slug, tenantName: config.name };
  }

  private async wipeTenant(tenantId: string) {
    await this.prisma.$transaction([
      this.prisma.domainEvent.deleteMany({ where: { tenantId } }),
      this.prisma.pOLine.deleteMany({ where: { purchaseOrder: { tenantId } } }),
      this.prisma.purchaseOrder.deleteMany({ where: { tenantId } }),
      this.prisma.transferLine.deleteMany({ where: { transferRequest: { tenantId } } }),
      this.prisma.transferRequest.deleteMany({ where: { tenantId } }),
      this.prisma.inventoryMovement.deleteMany({ where: { tenantId } }),
      this.prisma.item.deleteMany({ where: { department: { tenantId } } }),
      this.prisma.fieldDefinition.deleteMany({ where: { department: { tenantId } } }),
      this.prisma.departmentLink.deleteMany({ where: { tenantId } }),
      this.prisma.supplier.deleteMany({ where: { tenantId } }),
      this.prisma.user.deleteMany({ where: { tenantId } }),
      this.prisma.department.deleteMany({ where: { tenantId } }),
      this.prisma.tenant.delete({ where: { id: tenantId } }),
    ]);
  }

  private restaurantConfig() {
    return {
      slug: 'riverside-restaurant',
      name: 'Riverside Restaurant',
      departments: [
        {
          key: 'stores',
          name: 'Central Stores',
          description: 'Main stockroom — receives all deliveries',
          fields: [
            { key: 'supplier', label: 'Supplier', type: 'TEXT' },
            { key: 'unit_cost', label: 'Unit Cost (£)', type: 'NUMBER' },
            { key: 'reorder_level', label: 'Reorder Level', type: 'NUMBER' },
            { key: 'expiry_date', label: 'Expiry Date', type: 'DATE' },
          ],
        },
        {
          key: 'kitchen',
          name: 'Kitchen',
          description: 'Food preparation and cooking',
          fields: [
            { key: 'reorder_level', label: 'Reorder Level', type: 'NUMBER' },
            { key: 'expiry_date', label: 'Expiry Date', type: 'DATE' },
          ],
        },
        {
          key: 'bar',
          name: 'Bar',
          description: 'Drinks and beverages',
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
      // All items start in Central Stores — the source for all transfers
      items: [
        { key: 'chicken', deptKey: 'stores', name: 'Chicken Breast', sku: 'CHK-001', quantity: 50, attributes: { supplier: 'Fresh Direct Ltd', unit_cost: 4.50, reorder_level: 20 } },
        { key: 'tomatoes', deptKey: 'stores', name: 'Tomatoes (kg)', sku: 'TOM-001', quantity: 8, attributes: { supplier: 'Fresh Direct Ltd', unit_cost: 1.20, reorder_level: 15 } },
        { key: 'pasta', deptKey: 'stores', name: 'Pasta (500g)', sku: 'PAS-001', quantity: 30, attributes: { supplier: 'Metro Wholesale', unit_cost: 0.80, reorder_level: 10 } },
        { key: 'vodka', deptKey: 'stores', name: 'Vodka (700ml)', sku: 'VOD-001', quantity: 20, attributes: { unit_cost: 12.00, reorder_level: 6 } },
        { key: 'wine', deptKey: 'stores', name: 'House Red Wine', sku: 'WIN-001', quantity: 30, attributes: { unit_cost: 6.50, reorder_level: 10 } },
        { key: 'oil', deptKey: 'stores', name: 'Olive Oil (1L)', sku: 'OIL-001', quantity: 6, attributes: { unit_cost: 3.20, reorder_level: 8 } },
      ],
      completedTransfers: [
        {
          from: 'stores', to: 'kitchen', requestedBy: 'Chef Marco', approvedBy: 'Manager Sara',
          hoursAgo: 48,
          lines: [{ itemKey: 'chicken', quantity: 10 }, { itemKey: 'pasta', quantity: 6 }],
        },
        {
          from: 'stores', to: 'bar', requestedBy: 'Bartender Liam', approvedBy: 'Manager Sara',
          hoursAgo: 24,
          lines: [{ itemKey: 'vodka', quantity: 6 }, { itemKey: 'wine', quantity: 8 }],
        },
      ],
      pendingTransfer: {
        from: 'stores', to: 'kitchen', requestedBy: 'Chef Marco',
        lines: [{ itemKey: 'tomatoes', quantity: 5 }, { itemKey: 'oil', quantity: 2 }],
      },
      approvedPO: {
        supplierKey: 'fresh', deptKey: 'stores', requestedBy: 'Manager Sara', approvedBy: 'Admin David',
        notes: 'Weekly fresh produce order',
        lines: [
          { name: 'Chicken Breast', sku: 'CHK-001', quantity: 30, unitCost: 4.50 },
          { name: 'Tomatoes (kg)', sku: 'TOM-001', quantity: 20, unitCost: 1.20 },
        ],
      },
      pendingPO: {
        supplierKey: 'metro', deptKey: 'stores', requestedBy: 'Manager Sara',
        notes: 'Dry goods restock',
        lines: [
          { name: 'Pasta (500g)', sku: 'PAS-001', quantity: 48, unitCost: 0.80 },
          { name: 'Olive Oil (1L)', sku: 'OIL-001', quantity: 12, unitCost: 3.20 },
        ],
      },
    };
  }

  private clinicConfig() {
    return {
      slug: 'city-clinic',
      name: 'City Clinic',
      departments: [
        {
          key: 'stores',
          name: 'General Supplies',
          description: 'Central medical supplies store',
          fields: [
            { key: 'supplier', label: 'Supplier', type: 'TEXT' },
            { key: 'unit_cost', label: 'Unit Cost (£)', type: 'NUMBER' },
            { key: 'reorder_level', label: 'Reorder Level', type: 'NUMBER' },
          ],
        },
        {
          key: 'pharmacy',
          name: 'Pharmacy',
          description: 'Medication dispensing',
          fields: [
            { key: 'batch_number', label: 'Batch Number', type: 'TEXT' },
            { key: 'expiry_date', label: 'Expiry Date', type: 'DATE' },
            { key: 'dosage', label: 'Dosage', type: 'TEXT' },
            { key: 'reorder_level', label: 'Reorder Level', type: 'NUMBER' },
          ],
        },
        {
          key: 'treatment',
          name: 'Treatment Room',
          description: 'Clinical treatment supplies',
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
      // All items start in General Supplies — the source for all transfers
      items: [
        { key: 'paracetamol', deptKey: 'stores', name: 'Paracetamol 500mg (x100)', sku: 'MED-PAR-001', quantity: 30, attributes: { supplier: 'PharmaDirect', unit_cost: 2.40, reorder_level: 40 } },
        { key: 'amoxicillin', deptKey: 'stores', name: 'Amoxicillin 250mg (x21)', sku: 'MED-AMX-001', quantity: 15, attributes: { supplier: 'PharmaDirect', unit_cost: 5.80, reorder_level: 20 } },
        { key: 'bandages', deptKey: 'stores', name: 'Bandages (box of 10)', sku: 'SUP-BND-001', quantity: 25, attributes: { supplier: 'MedSupply Co', unit_cost: 3.50, reorder_level: 15 } },
        { key: 'gloves', deptKey: 'stores', name: 'Latex Gloves (box of 100)', sku: 'SUP-GLV-001', quantity: 12, attributes: { supplier: 'MedSupply Co', unit_cost: 8.00, reorder_level: 10 } },
      ],
      completedTransfers: [
        {
          from: 'stores', to: 'pharmacy', requestedBy: 'Pharmacist Priya', approvedBy: 'Dr. Williams',
          hoursAgo: 72,
          lines: [{ itemKey: 'paracetamol', quantity: 10 }],
        },
        {
          from: 'stores', to: 'treatment', requestedBy: 'Nurse Adams', approvedBy: 'System (auto-approved)',
          hoursAgo: 36,
          lines: [{ itemKey: 'bandages', quantity: 5 }, { itemKey: 'gloves', quantity: 3 }],
        },
      ],
      pendingTransfer: {
        from: 'stores', to: 'pharmacy', requestedBy: 'Pharmacist Priya',
        lines: [{ itemKey: 'amoxicillin', quantity: 5 }],
      },
      approvedPO: {
        supplierKey: 'pharma', deptKey: 'stores', requestedBy: 'Dr. Williams', approvedBy: 'Admin Johnson',
        notes: 'Monthly medication restock',
        lines: [
          { name: 'Paracetamol 500mg (x100)', sku: 'MED-PAR-001', quantity: 40, unitCost: 2.40 },
          { name: 'Amoxicillin 250mg (x21)', sku: 'MED-AMX-001', quantity: 20, unitCost: 5.80 },
        ],
      },
      pendingPO: {
        supplierKey: 'medsupply', deptKey: 'stores', requestedBy: 'Nurse Adams',
        notes: 'Clinical supplies replenishment',
        lines: [
          { name: 'Bandages (box of 10)', sku: 'SUP-BND-001', quantity: 20, unitCost: 3.50 },
          { name: 'Latex Gloves (box of 100)', sku: 'SUP-GLV-001', quantity: 15, unitCost: 8.00 },
        ],
      },
    };
  }
}
