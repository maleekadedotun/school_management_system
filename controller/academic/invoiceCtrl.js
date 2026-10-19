const AsyncHandler = require("express-async-handler");
const crypto = require("crypto");
const mongoose = require("mongoose");
const StudentInvoice = require("../../models/Academy/StudentInvoice");
const FeeStructure = require("../../models/Academy/FeeStructure");
const Student = require("../../models/Academy/Student");
const Parent = require("../../models/Staff/Parent");

// Helper to generate unique invoice number
const generateInvoiceNumber = () => {
  const year = new Date().getFullYear();
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  const timePart = Date.now().toString().slice(-4);
  return `INV-${year}-${randomPart}${timePart}`;
};

//@desc Generate Invoices for a Class or Selected Students (Admin only)
//@route POST /api/v1/finance/invoices/generate-class
//@access Private (Admin)
exports.generateClassInvoicesCtrl = AsyncHandler(async (req, res) => {
  const { feeStructureId, studentIds, discount = 0, notes = "" } = req.body;

  if (!feeStructureId) {
    res.status(400);
    throw new Error("Fee structure ID is required");
  }

  const feeStructure = await FeeStructure.findById(feeStructureId)
    .populate("academicYear")
    .populate("academicTerm");

  if (!feeStructure) {
    res.status(404);
    throw new Error("Fee structure not found");
  }

  if (!feeStructure.isActive) {
    res.status(400);
    throw new Error("Cannot generate invoices for an inactive fee structure. Please reactivate it first.");
  }

  // Find target students
  let studentQuery = {
    isWithDrawn: false,
  };

  if (Array.isArray(studentIds) && studentIds.length > 0) {
    studentQuery._id = { $in: studentIds };
  } else {
    // Match students in the fee structure's class level
    const targetClass = feeStructure.classLevel.trim();
    studentQuery.$or = [
      { currentClassLevel: { $regex: new RegExp(`^${targetClass}$`, "i") } },
      { currentClassLevel: targetClass },
      { classLevels: { $in: [targetClass, new RegExp(`^${targetClass}$`, "i")] } },
    ];
  }

  const students = await Student.find(studentQuery);
  if (students.length === 0) {
    res.status(404);
    throw new Error(
      `No eligible students found in class "${feeStructure.classLevel}". Check student class assignments.`
    );
  }

  const generatedInvoices = [];
  const skippedStudents = [];

  // Snapshot line items from fee structure
  const itemsSnapshot = feeStructure.items.map((item) => ({
    name: item.name,
    category: item.category,
    amount: item.amount, // in kobo
  }));

  const subtotal = feeStructure.totalAmount; // in kobo
  const discountInKobo = Math.round(Number(discount) * 100); // if provided in Naira
  const totalDue = Math.max(0, subtotal - discountInKobo);

  for (const student of students) {
    // Duplicate prevention check: does this student already have an invoice for this year and term?
    const existing = await StudentInvoice.findOne({
      student: student._id,
      academicYear: feeStructure.academicYear._id,
      academicTerm: feeStructure.academicTerm._id,
    });

    if (existing) {
      skippedStudents.push({
        studentId: student._id,
        name: student.name,
        existingInvoiceNumber: existing.invoiceNumber,
      });
      continue;
    }

    let invoiceNumber = generateInvoiceNumber();
    // Safety check for unique invoice number collision
    let numberCollision = await StudentInvoice.findOne({ invoiceNumber });
    while (numberCollision) {
      invoiceNumber = generateInvoiceNumber();
      numberCollision = await StudentInvoice.findOne({ invoiceNumber });
    }

    const newInvoice = await StudentInvoice.create({
      invoiceNumber,
      student: student._id,
      feeStructure: feeStructure._id,
      classLevel: student.currentClassLevel || feeStructure.classLevel,
      academicYear: feeStructure.academicYear._id,
      academicTerm: feeStructure.academicTerm._id,
      items: itemsSnapshot,
      subtotal,
      discount: discountInKobo,
      totalAmountDue: totalDue,
      totalAmount: totalDue,
      amountPaid: 0,
      balanceDue: totalDue,
      balanceAmount: totalDue,
      currency: feeStructure.currency || "NGN",
      status: "unpaid",
      dueDate: feeStructure.dueDate,
      createdBy: req.userAuth._id,
      notes: notes.trim(),
    });

    generatedInvoices.push(newInvoice);
  }

  res.status(201).json({
    status: "Success",
    message: `Generated ${generatedInvoices.length} invoices for class "${feeStructure.classLevel}". (${skippedStudents.length} already invoiced students skipped).`,
    data: {
      generatedCount: generatedInvoices.length,
      skippedCount: skippedStudents.length,
      feeStructureName: feeStructure.name,
      classLevel: feeStructure.classLevel,
      generatedInvoices,
      skippedStudents,
    },
  });
});

//@desc Generate Single Student Invoice with Optional Custom Adjustment
//@route POST /api/v1/finance/invoices/generate-single
//@access Private (Admin)
exports.generateSingleStudentInvoiceCtrl = AsyncHandler(async (req, res) => {
  const { studentId, feeStructureId, discount = 0, notes = "" } = req.body;

  if (!studentId || !feeStructureId) {
    res.status(400);
    throw new Error("Student ID and Fee Structure ID are required");
  }

  const [student, feeStructure] = await Promise.all([
    Student.findById(studentId),
    FeeStructure.findById(feeStructureId)
      .populate("academicYear")
      .populate("academicTerm"),
  ]);

  if (!student) {
    res.status(404);
    throw new Error("Student not found");
  }
  if (!feeStructure) {
    res.status(404);
    throw new Error("Fee structure not found");
  }

  // Duplicate check
  const existing = await StudentInvoice.findOne({
    student: student._id,
    academicYear: feeStructure.academicYear._id,
    academicTerm: feeStructure.academicTerm._id,
  });

  if (existing) {
    res.status(409);
    throw new Error(
      `Student ${student.name} already has an active invoice (${existing.invoiceNumber}) for this academic year and term.`
    );
  }

  const itemsSnapshot = feeStructure.items.map((item) => ({
    name: item.name,
    category: item.category,
    amount: item.amount,
  }));

  const subtotal = feeStructure.totalAmount;
  const discountInKobo = Math.round(Number(discount) * 100);
  const totalDue = Math.max(0, subtotal - discountInKobo);

  let invoiceNumber = generateInvoiceNumber();
  let numberCollision = await StudentInvoice.findOne({ invoiceNumber });
  while (numberCollision) {
    invoiceNumber = generateInvoiceNumber();
    numberCollision = await StudentInvoice.findOne({ invoiceNumber });
  }

  const invoice = await StudentInvoice.create({
    invoiceNumber,
    student: student._id,
    feeStructure: feeStructure._id,
    classLevel: student.currentClassLevel || feeStructure.classLevel,
    academicYear: feeStructure.academicYear._id,
    academicTerm: feeStructure.academicTerm._id,
    items: itemsSnapshot,
    subtotal,
    discount: discountInKobo,
    totalAmountDue: totalDue,
    totalAmount: totalDue,
    amountPaid: 0,
    balanceDue: totalDue,
    balanceAmount: totalDue,
    currency: feeStructure.currency || "NGN",
    status: "unpaid",
    dueDate: feeStructure.dueDate,
    createdBy: req.userAuth._id,
    notes: notes.trim(),
  });

  const populated = await StudentInvoice.findById(invoice._id)
    .populate("student", "name email StudentId currentClassLevel")
    .populate("academicYear", "name")
    .populate("academicTerm", "name")
    .populate("feeStructure", "name");

  res.status(201).json({
    status: "Success",
    message: `Invoice generated for ${student.name}`,
    data: populated,
  });
});

//@desc Get All Invoices (Admin/Bursar) with Filtering & Search
//@route GET /api/v1/finance/invoices
//@access Private (Admin)
exports.getAllInvoicesAdminCtrl = AsyncHandler(async (req, res) => {
  const {
    classLevel,
    academicYear,
    academicTerm,
    status,
    search,
    page = 1,
    limit = 50,
  } = req.query;

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
  if (status && status !== "All") {
    query.status = status;
  }

  // Search by invoice number or student name/ID
  if (search && search.trim()) {
    const sTerm = search.trim();
    const matchingStudents = await Student.find({
      $or: [
        { name: { $regex: sTerm, $options: "i" } },
        { StudentId: { $regex: sTerm, $options: "i" } },
        { email: { $regex: sTerm, $options: "i" } },
      ],
    }).select("_id");

    const matchedStudentIds = matchingStudents.map((s) => s._id);

    query.$or = [
      { invoiceNumber: { $regex: sTerm, $options: "i" } },
      { student: { $in: matchedStudentIds } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, parseInt(limit));
  const skip = (pageNum - 1) * limitNum;

  const [totalCount, invoices] = await Promise.all([
    StudentInvoice.countDocuments(query),
    StudentInvoice.find(query)
      .populate("student", "name email StudentId currentClassLevel")
      .populate("academicYear", "name fromYear toYear isCurrent")
      .populate("academicTerm", "name duration")
      .populate("feeStructure", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
  ]);

  // Aggregate financial metrics for the current query
  const statsAggregate = await StudentInvoice.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalBilled: { $sum: "$totalAmountDue" },
        totalPaid: { $sum: "$amountPaid" },
        totalOutstanding: { $sum: "$balanceDue" },
        paidCount: {
          $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] },
        },
        partiallyPaidCount: {
          $sum: { $cond: [{ $eq: ["$status", "partially_paid"] }, 1, 0] },
        },
        unpaidCount: {
          $sum: { $cond: [{ $eq: ["$status", "unpaid"] }, 1, 0] },
        },
        overdueCount: {
          $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] },
        },
      },
    },
  ]);

  const metrics = statsAggregate[0] || {
    totalBilled: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    paidCount: 0,
    partiallyPaidCount: 0,
    unpaidCount: 0,
    overdueCount: 0,
  };

  res.status(200).json({
    status: "Success",
    count: invoices.length,
    total: totalCount,
    totalPages: Math.ceil(totalCount / limitNum),
    currentPage: pageNum,
    metrics,
    data: invoices,
  });
});

//@desc Get Single Invoice with Strict Ownership & Role Checks
//@route GET /api/v1/finance/invoices/:id
//@access Private (Admin, Student, Parent)
exports.getSingleInvoiceCtrl = AsyncHandler(async (req, res) => {
  const invoice = await StudentInvoice.findById(req.params.id)
    .populate("student", "name email StudentId currentClassLevel parent parentEmail")
    .populate("academicYear", "name fromYear toYear isCurrent")
    .populate("academicTerm", "name duration")
    .populate("feeStructure", "name description items");

  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  const userRole = req.userAuth.role;
  const userId = req.userAuth._id.toString();

  // Authorization check:
  // 1. Admin: permitted
  if (userRole === "admin") {
    // allowed
  }
  // 2. Student: must be the student on the invoice
  else if (userRole === "student") {
    const studentOwnerId = invoice.student?._id ? invoice.student._id.toString() : invoice.student?.toString();
    if (studentOwnerId !== userId) {
      res.status(403);
      throw new Error("Access denied: You are not authorized to view another student's invoice.");
    }
  }
  // 3. Parent: must be verified parent of the student on this invoice
  else if (userRole === "parent") {
    const parentDoc = await Parent.findById(userId);
    const studentOwnerId = invoice.student?._id ? invoice.student._id.toString() : invoice.student?.toString();
    const isLinked = parentDoc?.children?.some((c) => c.toString() === studentOwnerId);

    if (!isLinked) {
      res.status(403);
      throw new Error("Access denied: This invoice does not belong to any student linked to your parent account.");
    }
  } else {
    res.status(403);
    throw new Error("Access denied: Unauthorized role.");
  }

  res.status(200).json({
    status: "Success",
    data: invoice,
  });
});

//@desc Get Invoices for Logged-In Student Portal
//@route GET /api/v1/finance/invoices/my-invoices
//@access Private (Student)
exports.getStudentInvoicesPortalCtrl = AsyncHandler(async (req, res) => {
  const studentId = req.userAuth._id;

  const invoices = await StudentInvoice.find({ student: studentId })
    .populate("academicYear", "name fromYear toYear isCurrent")
    .populate("academicTerm", "name duration")
    .populate("feeStructure", "name")
    .sort({ createdAt: -1 });

  // Calculate totals for student
  let totalBilled = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;

  invoices.forEach((inv) => {
    totalBilled += inv.totalAmountDue;
    totalPaid += inv.amountPaid;
    totalOutstanding += inv.balanceDue;
  });

  res.status(200).json({
    status: "Success",
    count: invoices.length,
    metrics: {
      totalBilled,
      totalPaid,
      totalOutstanding,
    },
    data: invoices,
  });
});

//@desc Get Invoices for Logged-In Parent's Children
//@route GET /api/v1/finance/invoices/parent/children-invoices
//@access Private (Parent)
exports.getParentStudentInvoicesCtrl = AsyncHandler(async (req, res) => {
  const parentId = req.userAuth._id;
  const parent = await Parent.findById(parentId).populate("children", "name email StudentId currentClassLevel");

  if (!parent) {
    res.status(404);
    throw new Error("Parent profile not found");
  }

  const childIds = (parent.children || []).map((c) => c._id);

  const invoices = await StudentInvoice.find({ student: { $in: childIds } })
    .populate("student", "name email StudentId currentClassLevel")
    .populate("academicYear", "name fromYear toYear isCurrent")
    .populate("academicTerm", "name duration")
    .populate("feeStructure", "name")
    .sort({ createdAt: -1 });

  let totalBilled = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;

  invoices.forEach((inv) => {
    totalBilled += inv.totalAmountDue;
    totalPaid += inv.amountPaid;
    totalOutstanding += inv.balanceDue;
  });

  res.status(200).json({
    status: "Success",
    count: invoices.length,
    children: parent.children,
    metrics: {
      totalBilled,
      totalPaid,
      totalOutstanding,
    },
    data: invoices,
  });
});

//@desc Update Invoice Discount / Adjustment (Admin only)
//@route PATCH /api/v1/finance/invoices/:id/discount
//@access Private (Admin)
exports.updateInvoiceDiscountCtrl = AsyncHandler(async (req, res) => {
  const { discount, notes } = req.body;
  const invoice = await StudentInvoice.findById(req.params.id);

  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  if (invoice.status === "paid") {
    res.status(400);
    throw new Error("Cannot apply discount to a fully paid invoice");
  }

  const discountKobo = Math.round(Number(discount) * 100);
  if (isNaN(discountKobo) || discountKobo < 0) {
    res.status(400);
    throw new Error("Invalid discount amount");
  }

  if (discountKobo > invoice.subtotal) {
    res.status(400);
    throw new Error("Discount cannot exceed invoice subtotal");
  }

  const newTotalDue = invoice.subtotal - discountKobo;
  if (newTotalDue < invoice.amountPaid) {
    res.status(400);
    throw new Error(
      `New total due (${newTotalDue / 100}) cannot be less than already collected amount (${invoice.amountPaid / 100})`
    );
  }

  invoice.discount = discountKobo;
  invoice.totalAmountDue = newTotalDue;
  invoice.totalAmount = newTotalDue;
  invoice.balanceDue = newTotalDue - invoice.amountPaid;
  invoice.balanceAmount = invoice.balanceDue;

  if (invoice.balanceDue === 0) {
    invoice.status = "paid";
    invoice.paidAt = new Date();
  } else if (invoice.amountPaid > 0) {
    invoice.status = "partially_paid";
  } else {
    invoice.status = "unpaid";
  }

  if (notes) invoice.notes = notes;
  await invoice.save();

  const updated = await StudentInvoice.findById(invoice._id)
    .populate("student", "name email StudentId currentClassLevel")
    .populate("academicYear", "name")
    .populate("academicTerm", "name")
    .populate("feeStructure", "name");

  res.status(200).json({
    status: "Success",
    message: "Invoice discount applied and balance updated successfully",
    data: updated,
  });
});

//@desc Unified Invoices Controller (Admin, Student, Parent)
//@route GET /api/v1/finance/invoices
//@access Private (Admin, Student, Parent)
exports.getInvoicesCtrl = AsyncHandler(async (req, res, next) => {
  const role = req.userAuth?.role;
  if (role === "student") {
    return exports.getStudentInvoicesPortalCtrl(req, res, next);
  }
  if (role === "parent") {
    return exports.getParentStudentInvoicesCtrl(req, res, next);
  }
  return exports.getAllInvoicesAdminCtrl(req, res, next);
});

//@desc Delete an invoice (Admin only)
//@route DELETE /api/v1/finance/invoices/:id
//@access Private (Admin)
exports.deleteInvoiceCtrl = AsyncHandler(async (req, res) => {
  const invoice = await StudentInvoice.findById(req.params.id);
  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  if (invoice.amountPaid > 0) {
    res.status(400);
    throw new Error(
      "Cannot delete invoice with existing payments. You must retain financial records for audit compliance."
    );
  }

  await invoice.deleteOne();
  res.status(200).json({
    status: "Success",
    message: "Invoice deleted successfully",
  });
});

// Aliases for compatibility with financeRouter
exports.generateSingleInvoiceCtrl = exports.generateSingleStudentInvoiceCtrl;
exports.getInvoiceByIdCtrl = exports.getSingleInvoiceCtrl;
exports.applyInvoiceDiscountCtrl = exports.updateInvoiceDiscountCtrl;
exports.getParentChildrenInvoicesCtrl = exports.getParentStudentInvoicesCtrl;
