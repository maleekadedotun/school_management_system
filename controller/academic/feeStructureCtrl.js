const AsyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const FeeStructure = require("../../models/Academy/FeeStructure");
const StudentInvoice = require("../../models/Academy/StudentInvoice");
const AcademicYear = require("../../models/Academy/AcademicYear");
const AcademicTerm = require("../../models/Academy/AcademicTerm");

//@desc Create a new Fee Structure (Admin only)
//@route POST /api/v1/finance/fee-structures
//@access Private (Admin)
exports.createFeeStructureCtrl = AsyncHandler(async (req, res) => {
  const {
    name,
    classLevel,
    academicYear,
    academicTerm,
    items,
    dueDate,
    currency = "NGN",
  } = req.body;

  if (!name || !classLevel || !academicYear || !academicTerm || !dueDate) {
    res.status(400);
    throw new Error("Name, class level, academic year, academic term, and due date are required");
  }

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400);
    throw new Error("At least one fee item is required");
  }

  // Validate items and compute total in kobo
  let calculatedTotal = 0;
  const sanitizedItems = items.map((item, idx) => {
    if (!item.name || typeof item.name !== "string" || !item.name.trim()) {
      res.status(400);
      throw new Error(`Fee item at row ${idx + 1} must have a valid name`);
    }

    // Amounts can arrive in Naira or Kobo. If isKobo flag is false or not provided, amounts are in Naira and converted to Kobo
    const rawAmount = Number(item.amount);
    if (isNaN(rawAmount) || rawAmount < 0) {
      res.status(400);
      throw new Error(`Invalid amount for item "${item.name}"`);
    }

    // Standard conversion: if payload specifies item.isKobo, keep as-is; otherwise assume Naira and multiply by 100
    const koboAmount = item.isKobo ? Math.round(rawAmount) : Math.round(rawAmount * 100);
    calculatedTotal += koboAmount;

    let category = (item.category || "other").toString().toLowerCase().trim();
    if (category === "exam") category = "examination";

    return {
      name: item.name.trim(),
      category,
      amount: koboAmount,
      description: (item.description || "").trim(),
    };
  });

  // Verify academic year and term exist
  const [yearDoc, termDoc] = await Promise.all([
    AcademicYear.findById(academicYear),
    AcademicTerm.findById(academicTerm),
  ]);

  if (!yearDoc) {
    res.status(404);
    throw new Error("Academic Year not found");
  }
  if (!termDoc) {
    res.status(404);
    throw new Error("Academic Term not found");
  }

  // Check for duplicate active fee structure for same class, year & term
  const existingActive = await FeeStructure.findOne({
    classLevel: { $regex: new RegExp(`^${classLevel.trim()}$`, "i") },
    academicYear,
    academicTerm,
    isActive: true,
  });

  if (existingActive) {
    res.status(409);
    throw new Error(
      `An active fee structure ("${existingActive.name}") already exists for class "${classLevel}" in this academic term and year. Deactivate it first before creating a new one.`
    );
  }

  const feeStructure = await FeeStructure.create({
    name: name.trim(),
    classLevel: classLevel.trim(),
    academicYear,
    academicTerm,
    items: sanitizedItems,
    totalAmount: calculatedTotal,
    currency,
    dueDate: new Date(dueDate),
    isActive: true,
    createdBy: req.userAuth._id,
  });

  const populated = await FeeStructure.findById(feeStructure._id)
    .populate("academicYear", "name fromYear toYear isCurrent")
    .populate("academicTerm", "name duration")
    .populate("createdBy", "name email");

  res.status(201).json({
    status: "Success",
    message: "Fee structure created successfully",
    data: populated,
  });
});

//@desc Get all Fee Structures
//@route GET /api/v1/finance/fee-structures
//@access Private (Admin)
exports.getFeeStructuresCtrl = AsyncHandler(async (req, res) => {
  const { classLevel, academicYear, academicTerm, isActive } = req.query;

  const query = {};
  if (classLevel && classLevel !== "All") {
    query.classLevel = { $regex: new RegExp(`^${classLevel.trim()}$`, "i") };
  }
  if (academicYear && academicYear !== "All") {
    query.academicYear = academicYear;
  }
  if (academicTerm && academicTerm !== "All") {
    query.academicTerm = academicTerm;
  }
  if (isActive !== undefined && isActive !== "All") {
    query.isActive = isActive === "true";
  }

  const structures = await FeeStructure.find(query)
    .populate("academicYear", "name fromYear toYear isCurrent")
    .populate("academicTerm", "name duration")
    .populate("createdBy", "name email")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "Success",
    count: structures.length,
    data: structures,
  });
});

//@desc Get single Fee Structure
//@route GET /api/v1/finance/fee-structures/:id
//@access Private (Admin)
exports.getSingleFeeStructureCtrl = AsyncHandler(async (req, res) => {
  const structure = await FeeStructure.findById(req.params.id)
    .populate("academicYear", "name fromYear toYear isCurrent")
    .populate("academicTerm", "name duration")
    .populate("createdBy", "name email");

  if (!structure) {
    res.status(404);
    throw new Error("Fee structure not found");
  }

  // Count existing invoices linked to this fee structure
  const linkedInvoicesCount = await StudentInvoice.countDocuments({
    feeStructure: structure._id,
  });

  res.status(200).json({
    status: "Success",
    data: {
      ...structure.toObject(),
      linkedInvoicesCount,
    },
  });
});

//@desc Update Fee Structure (Preserves historical invoices)
//@route PUT /api/v1/finance/fee-structures/:id
//@access Private (Admin)
exports.updateFeeStructureCtrl = AsyncHandler(async (req, res) => {
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) {
    res.status(404);
    throw new Error("Fee structure not found");
  }

  const {
    name,
    classLevel,
    academicYear,
    academicTerm,
    items,
    dueDate,
    isActive,
  } = req.body;

  if (name) structure.name = name.trim();
  if (classLevel) structure.classLevel = classLevel.trim();
  if (academicYear) structure.academicYear = academicYear;
  if (academicTerm) structure.academicTerm = academicTerm;
  if (dueDate) structure.dueDate = new Date(dueDate);
  if (isActive !== undefined) structure.isActive = Boolean(isActive);

  if (Array.isArray(items) && items.length > 0) {
    let calculatedTotal = 0;
    structure.items = items.map((item, idx) => {
      if (!item.name || !item.name.trim()) {
        res.status(400);
        throw new Error(`Fee item at row ${idx + 1} must have a name`);
      }
      const rawAmount = Number(item.amount);
      if (isNaN(rawAmount) || rawAmount < 0) {
        res.status(400);
        throw new Error(`Invalid amount for item "${item.name}"`);
      }
      const koboAmount = item.isKobo ? Math.round(rawAmount) : Math.round(rawAmount * 100);
      calculatedTotal += koboAmount;

      let category = (item.category || "other").toString().toLowerCase().trim();
      if (category === "exam") category = "examination";

      return {
        name: item.name.trim(),
        category,
        amount: koboAmount,
        description: (item.description || "").trim(),
      };
    });
    structure.totalAmount = calculatedTotal;
  }

  await structure.save();

  const updated = await FeeStructure.findById(structure._id)
    .populate("academicYear", "name fromYear toYear isCurrent")
    .populate("academicTerm", "name duration")
    .populate("createdBy", "name email");

  res.status(200).json({
    status: "Success",
    message: "Fee structure updated successfully (existing issued invoices remain preserved)",
    data: updated,
  });
});

//@desc Toggle Fee Structure Active Status (Deactivate / Reactivate)
//@route PATCH /api/v1/finance/fee-structures/:id/toggle-status
//@access Private (Admin)
exports.toggleFeeStructureStatusCtrl = AsyncHandler(async (req, res) => {
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) {
    res.status(404);
    throw new Error("Fee structure not found");
  }

  // If activating, make sure no other active structure exists for same class/year/term
  if (!structure.isActive) {
    const conflict = await FeeStructure.findOne({
      _id: { $ne: structure._id },
      classLevel: structure.classLevel,
      academicYear: structure.academicYear,
      academicTerm: structure.academicTerm,
      isActive: true,
    });
    if (conflict) {
      res.status(409);
      throw new Error(
        `Cannot activate: another active fee structure ("${conflict.name}") already exists for class "${structure.classLevel}".`
      );
    }
  }

  structure.isActive = !structure.isActive;
  await structure.save();

  res.status(200).json({
    status: "Success",
    message: `Fee structure ${structure.isActive ? "activated" : "deactivated"} successfully`,
    data: structure,
  });
});

//@desc Delete Fee Structure (Admin only)
//@route DELETE /api/v1/finance/fee-structures/:id
//@access Private (Admin)
exports.deleteFeeStructureCtrl = AsyncHandler(async (req, res) => {
  const structure = await FeeStructure.findById(req.params.id);
  if (!structure) {
    res.status(404);
    throw new Error("Fee structure not found");
  }

  const invoiceCount = await StudentInvoice.countDocuments({ feeStructure: structure._id });
  if (invoiceCount > 0) {
    res.status(400);
    throw new Error(
      `Cannot delete fee structure: ${invoiceCount} student invoice(s) have already been issued using this template. Please deactivate it instead to preserve audit records.`
    );
  }

  await structure.deleteOne();
  res.status(200).json({
    status: "success",
    message: "Fee structure deleted successfully",
  });
});

// Aliases for router compatibility
exports.getAllFeeStructuresCtrl = exports.getFeeStructuresCtrl;
exports.getFeeStructureByIdCtrl = exports.getSingleFeeStructureCtrl;
