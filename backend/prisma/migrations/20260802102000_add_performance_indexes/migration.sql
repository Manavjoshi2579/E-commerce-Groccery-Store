-- Performance indexes for large catalog, order, payment, invoice, and delivery operations.
CREATE INDEX `Category_name_idx` ON `Category`(`name`);
CREATE INDEX `Category_updatedAt_idx` ON `Category`(`updatedAt`);

CREATE INDEX `Brand_updatedAt_idx` ON `Brand`(`updatedAt`);

CREATE INDEX `Product_name_idx` ON `Product`(`name`);
CREATE INDEX `Product_createdAt_idx` ON `Product`(`createdAt`);
CREATE INDEX `Product_updatedAt_idx` ON `Product`(`updatedAt`);
CREATE INDEX `Product_categoryId_status_updatedAt_idx` ON `Product`(`categoryId`, `status`, `updatedAt`);
CREATE INDEX `Product_brandId_status_updatedAt_idx` ON `Product`(`brandId`, `status`, `updatedAt`);
CREATE INDEX `Product_status_featured_updatedAt_idx` ON `Product`(`status`, `featured`, `updatedAt`);

CREATE INDEX `Inventory_stock_idx` ON `Inventory`(`stock`);
CREATE INDEX `Inventory_reserved_idx` ON `Inventory`(`reserved`);
CREATE INDEX `Inventory_updatedAt_idx` ON `Inventory`(`updatedAt`);

CREATE INDEX `StockMovement_productId_createdAt_idx` ON `StockMovement`(`productId`, `createdAt`);
CREATE INDEX `StockMovement_type_createdAt_idx` ON `StockMovement`(`type`, `createdAt`);

CREATE INDEX `Order_updatedAt_idx` ON `Order`(`updatedAt`);
CREATE INDEX `Order_paymentStatus_idx` ON `Order`(`paymentStatus`);
CREATE INDEX `Order_customerPhone_idx` ON `Order`(`customerPhone`);
CREATE INDEX `Order_status_createdAt_idx` ON `Order`(`status`, `createdAt`);
CREATE INDEX `Order_userId_createdAt_idx` ON `Order`(`userId`, `createdAt`);

CREATE INDEX `Payment_createdAt_idx` ON `Payment`(`createdAt`);
CREATE INDEX `Payment_status_createdAt_idx` ON `Payment`(`status`, `createdAt`);

CREATE INDEX `Invoice_invoiceDate_idx` ON `Invoice`(`invoiceDate`);
CREATE INDEX `Invoice_createdAt_idx` ON `Invoice`(`createdAt`);

CREATE INDEX `DeliveryAssignment_deliveryStaffId_status_idx` ON `DeliveryAssignment`(`deliveryStaffId`, `status`);
