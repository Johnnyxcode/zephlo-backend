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

    // Create entity types with fields, workflows, and seeded records
    for (const et of config.entityTypes) {
      const entityType = await this.prisma.entityType.create({
        data: {
          tenantId,
          name: et.name,
          slug: et.slug,
          description: et.description,
          icon: et.icon,
          roles: et.roles,
        },
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
            config: (f as any).config ?? undefined,
            sortOrder: i,
          },
        });
      }

      if (et.workflow) {
        await this.prisma.workflowDefinition.create({
          data: {
            entityTypeId: entityType.id,
            states: et.workflow.states as any,
            transitions: et.workflow.transitions as any,
          },
        });
      }

      for (const record of et.records ?? []) {
        const entityRecord = await this.prisma.entityRecord.create({
          data: { tenantId, entityTypeId: entityType.id, attributes: record.attributes },
        });

        if (et.workflow && record.initialState) {
          await this.prisma.workflowInstance.create({
            data: { entityRecordId: entityRecord.id, currentState: record.initialState },
          });
        }
      }
    }

    await this.prisma.domainEvent.create({
      data: { tenantId, type: 'demo.seeded', actorName: 'System', payload: { scenario } },
    });

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
      entityTypes: [
        {
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
            { attributes: { name: 'Sophie Williams', email: 'sophie@example.com', phone: '07700 900001', notes: 'Regular Thursday lunch' }, initialState: null },
            { attributes: { name: 'James Patel', email: 'james@example.com', phone: '07700 900002', notes: 'Allergy: nuts' }, initialState: null },
            { attributes: { name: 'Amara Osei', email: 'amara@example.com', phone: '07700 900003', notes: '' }, initialState: null },
          ],
        },
        {
          name: 'Reservation',
          slug: 'reservation',
          description: 'Table bookings and walk-ins',
          icon: 'ClipboardCheck',
          roles: ['admin', 'manager', 'staff'],
          fields: [
            { key: 'customer_name', label: 'Customer Name', fieldType: 'TEXT', required: true },
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
            { attributes: { customer_name: 'Sophie Williams', date: '2026-06-07', party_size: 4, table: 'T3', special_requests: 'Window seat preferred' }, initialState: 'confirmed' },
            { attributes: { customer_name: 'James Patel', date: '2026-06-07', party_size: 2, table: '', special_requests: 'Nut allergy' }, initialState: 'pending' },
            { attributes: { customer_name: 'Amara Osei', date: '2026-06-05', party_size: 6, table: 'T7', special_requests: '' }, initialState: 'completed' },
          ],
        },
      ],
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
      entityTypes: [
        {
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
            { attributes: { name: 'Eleanor Voss', dob: '1978-03-14', contact: '07700 900101', medical_record_number: 'MRN-0041', notes: 'Hypertension, annual review due' }, initialState: null },
            { attributes: { name: 'Marcus Obi', dob: '1992-11-05', contact: '07700 900102', medical_record_number: 'MRN-0042', notes: 'Diabetic — monitor HbA1c' }, initialState: null },
            { attributes: { name: 'Priya Sharma', dob: '1965-07-22', contact: '07700 900103', medical_record_number: 'MRN-0043', notes: '' }, initialState: null },
          ],
        },
        {
          name: 'Appointment',
          slug: 'appointment',
          description: 'Patient appointments and consultations',
          icon: 'Stethoscope',
          roles: ['admin', 'manager', 'staff'],
          fields: [
            { key: 'patient_name', label: 'Patient Name', fieldType: 'TEXT', required: true },
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
            { attributes: { patient_name: 'Eleanor Voss', date: '2026-06-06', time: '09:30', doctor: 'Dr. Williams', type: 'Follow-up' }, initialState: 'scheduled' },
            { attributes: { patient_name: 'Marcus Obi', date: '2026-06-06', time: '10:15', doctor: 'Dr. Chen', type: 'Consultation' }, initialState: 'checked_in' },
            { attributes: { patient_name: 'Priya Sharma', date: '2026-06-04', time: '14:00', doctor: 'Dr. Williams', type: 'Procedure' }, initialState: 'completed' },
          ],
        },
      ],
    };
  }
}
