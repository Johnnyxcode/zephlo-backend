# Zephlo Platform Roadmap

## Two-Platform Architecture

Zephlo is built on two complementary engines that share stock as a common bridge:

| Platform | Purpose | Core Flow |
|---|---|---|
| **Procure-to-Pay (Ops Engine)** | Cost and operations side — everything entering the business | Supplier → Purchase Order → Receive → Stock |
| **Order-to-Cash (Revenue Engine)** | Revenue side — everything leaving the business | Customer → Sale Order → Invoice → Payment |

Stock is the bridge. Items bought via Purchase Orders appear in departments. Items sold via Sale Orders are drawn from that same stock. The Catalog links both sides — items have both a cost price (Procure-to-Pay) and a selling price (Order-to-Cash).

---

## What's Live Today

**Procure-to-Pay (Ops Engine)**
- Multi-tenant architecture with role-based access control (RBAC)
- Department management
- Inventory items, stock tracking, and low-stock alerts
- Transfer requests with approval workflow
- Purchase orders with waybill/delivery note tracking, UoM per line, supplier management
- Reports — PnL summary, spending by day/week/month, full audit log with PO details, CSV export

**Order-to-Cash (Revenue Engine)**
- Customer management
- Catalog — products/services with selling price, cost price, margin %, and tax rates
- Sale Orders — customer order builder with line items from catalog, confirm/cancel/invoice flow
- Invoices — auto-calculated from order lines, mark sent, write-off, cancel
- Payments — record payments against invoices (cash, card, bank transfer, mobile money, cheque), invoice auto-updates to PAID/PARTIALLY_PAID

**Entity Engine (custom modules)**
- Build any module with custom fields and field types
- Workflow states and transitions per module
- Record creation and management
- `RELATION` field type — single cross-module record lookup
- Reverse relationships endpoint — view linked records from the target side
- Industry templates (Restaurant, Clinic) — backend seeded, not yet surfaced in onboarding

**Platform**
- Onboarding wizard (setup flow)
- Demo mode with role switching
- Live overview dashboard with per-period filters (Today / 7d / 30d / All time / Custom)

---

## V1 — Making the Platform Coherent

> Theme: Industry-first modules + record relationships that tell a business story

### 1. Industry templates in the onboarding wizard
Industry templates (Clinic, Restaurant) exist in the backend but the onboarding wizard doesn't surface them. The product experience problem: users set up a blank workspace when they could start with a fully structured industry module set in one click.

- Surface template selection as a step in the onboarding wizard
- Pre-load modules, fields, and workflow states for the chosen industry
- Allow users to customise after loading

### 2. Clinic — first-class ERP module set
Research and define the standard business modules for a clinic, along with their fields, workflows, and relationships. Starting with Clinic as the anchor industry before expanding.

Candidate modules: Patient, Appointment, Doctor, Treatment, Prescription, Invoice, Payment

### 3. Cross-module relationships (build on existing foundation)
The `RELATION` field type and reverse relationships endpoint are already built. V1 completes the user-facing story:

- **Single lookup** — one record points to one record in another module (exists in field type, needs UI polish)
- **One-to-many / Many-to-one** — surface all related records when viewing a parent record (reverse endpoint exists, needs UI integration)

Target flow: Patient → Appointment → Invoice → Payment, fully navigable from any record.

### 4. Activity / timeline on records
Every record gets a chronological trail of events — status changes, notes, comments, approvals. Visible as a timeline panel on the record detail view.

- Domain events already emitted by the backend; surface them per-record
- Add manual note/comment entry

### 5. File attachments on records
Upload and associate files (PDFs, images, contracts) with any record. Universally needed across every industry from day one.

---

## V2 — Deepening Relationships

> Theme: Complex relationship types + more industries

### 6. Multi-lookup relationships
One record pointing to multiple records across modules (e.g., an Invoice covering multiple Appointments). Requires a new field type and UI for selecting multiple linked records.

### 7. Junction / bridge relationships
An intermediary record connects two modules and stores extra data about the relationship itself (e.g., a Treatment record connecting Patient + Doctor + storing dosage, duration, and outcome). Enables truly complex many-to-many scenarios.

### 8. Restaurant — first-class ERP module set
Apply the same industry-first research approach to Restaurant. Candidate modules: Menu Item, Table, Order, Order Line, Kitchen Ticket, Reservation, Invoice, Payment.

### 9. Self-referencing relationships
A record referencing another record in the same module — useful for org charts, product categories, task dependencies, and reporting structures.

---

## V3+ — Platform Scale

> Theme: Native many-to-many, additional industries, and hierarchy

### 10. Parent-child hierarchy
One record acting as a parent containing or organising multiple child records. Useful for product variants, project tasks, and location trees. Complex to get right in the UI — deferred until relationship patterns are stable.

### 11. Many-to-many (native)
Multiple records on both sides relating to multiple records. In most cases better served by a junction record (V2), but some scenarios need native support.

### 12. Additional industries
Retail, Manufacturing, Real Estate, Legal, Education — each researched and built industry by industry using the same module-first approach.

### 13. Attachment / document relationship
Full document management — version history, access control, and linking documents to multiple records across modules.

---

## Relationship Type Reference

| Type | V1 | V2 | V3+ |
|---|---|---|---|
| Single lookup (one → one record) | ✅ | | |
| One-to-many / Many-to-one | ✅ | | |
| Activity / timeline | ✅ | | |
| File attachment | ✅ | | |
| Multi-lookup | | ✅ | |
| Junction / bridge | | ✅ | |
| Self-referencing | | ✅ | |
| Parent-child hierarchy | | | ✅ |
| Many-to-many (native) | | | ✅ |
| Cross-module (enabled by all above) | ✅ | ✅ | ✅ |
