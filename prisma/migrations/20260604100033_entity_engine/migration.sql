-- CreateTable
CREATE TABLE "EntityType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "roles" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EntityField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityTypeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntityField_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "EntityType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntityRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "entityTypeId" TEXT NOT NULL,
    "attributes" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EntityRecord_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "EntityType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityTypeId" TEXT NOT NULL,
    "states" JSONB NOT NULL,
    "transitions" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowDefinition_entityTypeId_fkey" FOREIGN KEY ("entityTypeId") REFERENCES "EntityType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityRecordId" TEXT NOT NULL,
    "currentState" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowInstance_entityRecordId_fkey" FOREIGN KEY ("entityRecordId") REFERENCES "EntityRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowInstanceId" TEXT NOT NULL,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "transitionLabel" TEXT NOT NULL,
    "actorName" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowEvent_workflowInstanceId_fkey" FOREIGN KEY ("workflowInstanceId") REFERENCES "WorkflowInstance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EntityType_tenantId_slug_key" ON "EntityType"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "EntityField_entityTypeId_key_key" ON "EntityField"("entityTypeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_entityTypeId_key" ON "WorkflowDefinition"("entityTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowInstance_entityRecordId_key" ON "WorkflowInstance"("entityRecordId");
