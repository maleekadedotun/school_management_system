const mongoose = require("mongoose");

const feeItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        "tuition",
        "examination",
        "exam",
        "library",
        "laboratory",
        "development",
        "sports",
        "ict",
        "uniform",
        "hostel",
        "transport",
        "books",
        "medical",
        "pta",
        "other",
      ],
      default: "other",
      lowercase: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      // Stored in kobo (e.g. 50,000 NGN = 5,000,000 kobo)
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: true }
);

const feeStructureSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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
    items: {
      type: [feeItemSchema],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: "A fee structure must contain at least one fee item",
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      // Total amount in kobo (sum of all items)
    },
    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
feeStructureSchema.index({ classLevel: 1, academicYear: 1, academicTerm: 1, isActive: 1 });
feeStructureSchema.index({ academicYear: 1, academicTerm: 1 });

const FeeStructure = mongoose.model("FeeStructure", feeStructureSchema);
module.exports = FeeStructure;
