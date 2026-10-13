const express = require("express");
const financeRouter = express.Router();

const isAnyUserAuth = require("../../middlewares/isAnyUserAuth");
const roleRestriction = require("../../middlewares/roleRestriction");

const {
  createFeeStructureCtrl,
  getAllFeeStructuresCtrl,
  getFeeStructureByIdCtrl,
  updateFeeStructureCtrl,
  toggleFeeStructureStatusCtrl,
  deleteFeeStructureCtrl,
} = require("../../controller/academic/feeStructureCtrl");

const {
  generateClassInvoicesCtrl,
  generateSingleInvoiceCtrl,
  getInvoicesCtrl,
  getInvoiceByIdCtrl,
  applyInvoiceDiscountCtrl,
  deleteInvoiceCtrl,
  getParentChildrenInvoicesCtrl,
} = require("../../controller/academic/invoiceCtrl");

const {
  initializePaymentCtrl,
  verifyPaymentCtrl,
  paystackWebhookCtrl,
  getReceiptCtrl,
  getReceiptsCtrl,
  getPaymentTransactionsCtrl,
  getFinanceMetricsCtrl,
} = require("../../controller/academic/paymentCtrl");

// ==========================================
// 1. PUBLIC WEBHOOK ROUTE (Paystack)
// ==========================================
financeRouter.post("/payments/webhook", paystackWebhookCtrl);

// ==========================================
// 2. FEE STRUCTURE ROUTES
// ==========================================
// Admin only modifications
financeRouter.post(
  "/fee-structures",
  isAnyUserAuth,
  roleRestriction("admin"),
  createFeeStructureCtrl
);

financeRouter.get(
  "/fee-structures",
  isAnyUserAuth,
  roleRestriction("admin", "parent", "student"),
  getAllFeeStructuresCtrl
);

financeRouter.get(
  "/fee-structures/:id",
  isAnyUserAuth,
  roleRestriction("admin", "parent", "student"),
  getFeeStructureByIdCtrl
);

financeRouter.put(
  "/fee-structures/:id",
  isAnyUserAuth,
  roleRestriction("admin"),
  updateFeeStructureCtrl
);

financeRouter.patch(
  "/fee-structures/:id/toggle-status",
  isAnyUserAuth,
  roleRestriction("admin"),
  toggleFeeStructureStatusCtrl
);

financeRouter.delete(
  "/fee-structures/:id",
  isAnyUserAuth,
  roleRestriction("admin"),
  deleteFeeStructureCtrl
);

// ==========================================
// 3. STUDENT INVOICE ROUTES
// ==========================================
// Admin generation
financeRouter.post(
  "/invoices/generate-class",
  isAnyUserAuth,
  roleRestriction("admin"),
  generateClassInvoicesCtrl
);

financeRouter.post(
  "/invoices/generate-single",
  isAnyUserAuth,
  roleRestriction("admin"),
  generateSingleInvoiceCtrl
);

// Specific parent endpoint for children invoices
financeRouter.get(
  "/invoices/parent/children",
  isAnyUserAuth,
  roleRestriction("parent", "admin"),
  getParentChildrenInvoicesCtrl
);

// Listing & Fetching invoices with ownership filtering
financeRouter.get(
  "/invoices",
  isAnyUserAuth,
  roleRestriction("admin", "student", "parent"),
  getInvoicesCtrl
);

financeRouter.get(
  "/invoices/:id",
  isAnyUserAuth,
  roleRestriction("admin", "student", "parent"),
  getInvoiceByIdCtrl
);

// Admin invoice adjustments
financeRouter.put(
  "/invoices/:id/discount",
  isAnyUserAuth,
  roleRestriction("admin"),
  applyInvoiceDiscountCtrl
);

financeRouter.delete(
  "/invoices/:id",
  isAnyUserAuth,
  roleRestriction("admin"),
  deleteInvoiceCtrl
);

// ==========================================
// 4. PAYMENT INITIALIZATION & VERIFICATION
// ==========================================
financeRouter.post(
  "/payments/initialize",
  isAnyUserAuth,
  roleRestriction("admin", "student", "parent"),
  initializePaymentCtrl
);

financeRouter.get(
  "/payments/verify/:reference",
  isAnyUserAuth,
  roleRestriction("admin", "student", "parent"),
  verifyPaymentCtrl
);

financeRouter.get(
  "/transactions",
  isAnyUserAuth,
  roleRestriction("admin", "student", "parent"),
  getPaymentTransactionsCtrl
);

// ==========================================
// 5. RECEIPTS
// ==========================================
financeRouter.get(
  "/receipts",
  isAnyUserAuth,
  roleRestriction("admin", "student", "parent"),
  getReceiptsCtrl
);

financeRouter.get(
  "/receipts/:receiptId",
  isAnyUserAuth,
  roleRestriction("admin", "student", "parent"),
  getReceiptCtrl
);

// ==========================================
// 6. ADMIN FINANCE METRICS
// ==========================================
financeRouter.get(
  "/metrics",
  isAnyUserAuth,
  roleRestriction("admin"),
  getFinanceMetricsCtrl
);

module.exports = financeRouter;
