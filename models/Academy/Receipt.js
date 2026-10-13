const mongoose = require("mongoose");

const receiptSchema = new mongoose.Schema(
  {
    receiptNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentTransaction",
      required: true,
      unique: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentInvoice",
      required: true,
    },
    invoiceNumber: {
      type: String,
      default: "",
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    payer: {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        default: function () {
          return this.payerId || undefined;
        },
      },
      name: {
        type: String,
        default: function () {
          return this.payerName || "Student / Guardian";
        },
      },
      email: {
        type: String,
        default: function () {
          return this.payerEmail || "payment@school.com";
        },
      },
      role: {
        type: String,
        default: function () {
          return this.payerType || "student";
        },
      },
      payerType: {
        type: String,
        default: function () {
          return this.payerType || "student";
        },
      },
      payerId: {
        type: mongoose.Schema.Types.ObjectId,
        default: function () {
          return this.payerId || undefined;
        },
      },
    },
    payerType: {
      type: String,
      default: function () {
        return this.payer?.role || "student";
      },
    },
    payerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: function () {
        return this.payer?.user || undefined;
      },
    },
    payerName: {
      type: String,
      default: function () {
        return this.payer?.name || "Student / Guardian";
      },
    },
    payerEmail: {
      type: String,
      default: function () {
        return this.payer?.email || "payment@school.com";
      },
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 1,
      // In kobo
    },
    invoiceTotal: {
      type: Number,
      default: function () {
        return this.invoiceTotalAmount || 0;
      },
      // In kobo
    },
    invoiceTotalAmount: {
      type: Number,
      default: function () {
        return this.invoiceTotal || 0;
      },
      // In kobo
    },
    previousAmountPaid: {
      type: Number,
      default: 0,
      // In kobo
    },
    totalAmountPaidToDate: {
      type: Number,
      default: function () {
        return this.amountPaid || 0;
      },
      // In kobo
    },
    remainingBalance: {
      type: Number,
      default: 0,
      // In kobo
    },
    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
    },
    paymentMethod: {
      type: String,
      default: function () {
        return this.channel || "paystack";
      },
    },
    channel: {
      type: String,
      default: function () {
        return this.paymentMethod || "card";
      },
    },
    paymentReference: {
      type: String,
      required: true,
    },
    gatewayReference: {
      type: String,
      default: "",
    },
    paymentDate: {
      type: Date,
      default: function () {
        return this.paidAt || Date.now();
      },
    },
    paidAt: {
      type: Date,
      default: function () {
        return this.paymentDate || Date.now();
      },
    },
    academicYear: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
    },
    academicTerm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicTerm",
    },
    classLevel: {
      type: String,
      default: "",
    },
    itemsSnapshot: [
      {
        name: String,
        amount: Number,
        category: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

receiptSchema.pre("validate", function () {
  if (!this.payer) this.payer = {};

  const resolvedUser = this.payer.user || this.payer.payerId || this.payerId;
  const resolvedRole = this.payer.role || this.payer.payerType || this.payerType || "student";
  const resolvedName = this.payer.name || this.payerName || "Student / Guardian";
  const resolvedEmail = this.payer.email || this.payerEmail || "payment@school.com";

  this.payer.user = resolvedUser;
  this.payer.role = resolvedRole;
  this.payer.name = resolvedName;
  this.payer.email = resolvedEmail;
  this.payer.payerId = resolvedUser;
  this.payer.payerType = resolvedRole;

  this.payerId = resolvedUser;
  this.payerType = resolvedRole;
  this.payerName = resolvedName;
  this.payerEmail = resolvedEmail;

  if (!this.invoiceTotal && this.invoiceTotalAmount) this.invoiceTotal = this.invoiceTotalAmount;
  if (!this.invoiceTotalAmount && this.invoiceTotal) this.invoiceTotalAmount = this.invoiceTotal;

  if (!this.paidAt && this.paymentDate) this.paidAt = this.paymentDate;
  if (!this.paymentDate && this.paidAt) this.paymentDate = this.paidAt;

  if (!this.paymentMethod && this.channel) this.paymentMethod = this.channel;
  if (!this.channel && this.paymentMethod) this.channel = this.paymentMethod;
});

receiptSchema.index({ invoice: 1 });
receiptSchema.index({ student: 1 });
receiptSchema.index({ "payer.user": 1 });
receiptSchema.index({ payerId: 1 });
receiptSchema.index({ createdAt: -1 });

const Receipt = mongoose.model("Receipt", receiptSchema);
module.exports = Receipt;
