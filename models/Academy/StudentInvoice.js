const mongoose = require("mongoose");

const invoiceItemSnapshotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "other",
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      // In kobo
    },
  },
  { _id: false }
);

const studentInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    feeStructure: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeeStructure",
      required: true,
    },
    classLevel: {
      type: String,
      required: true,
      trim: true,
    },
    academicYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
    },
    academicTerm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicTerm",
      required: true,
    },
    // Immutable snapshot of items at time of invoice creation
    items: {
      type: [invoiceItemSnapshotSchema],
      default: function () {
        return this.itemsSnapshot || [];
      },
    },
    itemsSnapshot: {
      type: [invoiceItemSnapshotSchema],
      default: function () {
        return this.items || [];
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      // In kobo
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      // In kobo
    },
    totalAmountDue: {
      type: Number,
      default: function () {
        return this.totalAmount || 0;
      },
      min: 0,
      // In kobo (subtotal - discount)
    },
    totalAmount: {
      type: Number,
      default: function () {
        return this.totalAmountDue || 0;
      },
      min: 0,
      // In kobo
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
      // In kobo
    },
    balanceDue: {
      type: Number,
      default: function () {
        return this.balanceAmount !== undefined ? this.balanceAmount : (this.totalAmountDue || 0);
      },
      min: 0,
      // In kobo (totalAmountDue - amountPaid)
    },
    balanceAmount: {
      type: Number,
      default: function () {
        return this.balanceDue !== undefined ? this.balanceDue : (this.totalAmountDue || 0);
      },
      min: 0,
      // In kobo
    },
    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
    },
    status: {
      type: String,
      enum: ["unpaid", "partially_paid", "paid", "overdue"],
      default: "unpaid",
    },
    paymentHistory: [
      {
        transaction: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "PaymentTransaction",
        },
        reference: String,
        amount: Number,
        paidAt: {
          type: Date,
          default: Date.now,
        },
        channel: String,
      },
    ],
    issueDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidAt: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

studentInvoiceSchema.pre("validate", function () {
  if (this.totalAmountDue === undefined && this.totalAmount !== undefined) {
    this.totalAmountDue = this.totalAmount;
  }
  if (this.totalAmount === undefined && this.totalAmountDue !== undefined) {
    this.totalAmount = this.totalAmountDue;
  }

  if (this.balanceDue === undefined && this.balanceAmount !== undefined) {
    this.balanceDue = this.balanceAmount;
  }
  if (this.balanceAmount === undefined && this.balanceDue !== undefined) {
    this.balanceAmount = this.balanceDue;
  }

  if ((!this.items || this.items.length === 0) && this.itemsSnapshot && this.itemsSnapshot.length > 0) {
    this.items = this.itemsSnapshot;
  }
  if ((!this.itemsSnapshot || this.itemsSnapshot.length === 0) && this.items && this.items.length > 0) {
    this.itemsSnapshot = this.items;
  }

  if (!Array.isArray(this.paymentHistory)) {
    this.paymentHistory = [];
  }
});

// Unique compound index: one invoice per student per academic year and term
studentInvoiceSchema.index(
  { student: 1, academicYear: 1, academicTerm: 1 },
  { unique: true }
);
studentInvoiceSchema.index({ status: 1 });
studentInvoiceSchema.index({ classLevel: 1 });
studentInvoiceSchema.index({ dueDate: 1 });

const StudentInvoice = mongoose.model("StudentInvoice", studentInvoiceSchema);
module.exports = StudentInvoice;
