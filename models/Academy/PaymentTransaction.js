const mongoose = require("mongoose");

const paymentTransactionSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentInvoice",
      required: true,
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
      role: {
        type: String,
        enum: ["student", "parent", "admin"],
        default: function () {
          return this.payerType || "student";
        },
      },
      name: {
        type: String,
        trim: true,
        default: function () {
          return this.payerName || "Student / Guardian";
        },
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
        default: function () {
          return this.payerEmail || "payment@school.com";
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
    amount: {
      type: Number,
      required: true,
      min: 1,
      // In kobo
    },
    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
    },
    gateway: {
      type: String,
      enum: ["paystack", "flutterwave", "manual_cash", "manual_bank_transfer"],
      default: "paystack",
    },
    gatewayReference: {
      type: String,
      trim: true,
      default: "",
    },
    gatewayStatus: {
      type: String,
      default: "",
    },
    authorizationUrl: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "abandoned"],
      default: "pending",
    },
    channel: {
      type: String,
      default: "",
    },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    // CRITICAL: prevents duplicate application of transaction to invoice balance
    isAppliedToInvoice: {
      type: Boolean,
      default: false,
    },
    paidAt: {
      type: Date,
    },
    verifiedAt: {
      type: Date,
    },
    receipt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Receipt",
    },
  },
  {
    timestamps: true,
  }
);

// Auto-sync nested payer and flat payer fields with fallback defaults
paymentTransactionSchema.pre("validate", function () {
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
});

paymentTransactionSchema.index({ invoice: 1 });
paymentTransactionSchema.index({ student: 1 });
paymentTransactionSchema.index({ "payer.user": 1 });
paymentTransactionSchema.index({ payerId: 1 });
paymentTransactionSchema.index({ status: 1 });
paymentTransactionSchema.index({ createdAt: -1 });

const PaymentTransaction = mongoose.model("PaymentTransaction", paymentTransactionSchema);
module.exports = PaymentTransaction;
