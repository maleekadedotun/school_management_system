const AsyncHandler = require("express-async-handler");
const Parent = require("../../models/Staff/Parent");
const Student = require("../../models/Academy/Student");
const generateToken = require("../../utils/generateToken");
const { hashedPassword, isPasswordMatched } = require("../../utils/helpers");

//@desc Register a new parent (Admin or Self-Registration with student verification)
//@route POST /api/v1/parents/register
//@access Public or Private (Admin)
exports.parentRegisterCtrl = AsyncHandler(async (req, res) => {
  const { name, email, password, phone, studentIds = [], studentIdentifier } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Name, email, and password are required");
  }

  const existingParent = await Parent.findOne({ email: email.toLowerCase().trim() });
  if (existingParent) {
    res.status(400);
    throw new Error("A parent account with this email already exists");
  }

  // Link children if student IDs or identifiers provided
  let linkedChildren = [];
  if (Array.isArray(studentIds) && studentIds.length > 0) {
    const students = await Student.find({ _id: { $in: studentIds } });
    linkedChildren = students.map((s) => s._id);
  } else if (studentIdentifier) {
    // Search by studentId or email
    const student = await Student.findOne({
      $or: [
        { studentId: studentIdentifier.trim() },
        { StudentId: studentIdentifier.trim() },
        { email: studentIdentifier.trim().toLowerCase() },
      ],
    });
    if (student) {
      linkedChildren.push(student._id);
    }
  }

  const parent = await Parent.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password: await hashedPassword(password),
    phone: phone ? phone.trim() : "",
    children: linkedChildren,
  });

  // Also update child student documents to reference this parent
  if (linkedChildren.length > 0) {
    await Student.updateMany(
      { _id: { $in: linkedChildren } },
      { $set: { parent: parent._id, parentEmail: parent.email } }
    );
  }

  res.status(201).json({
    status: "success",
    message: "Parent registered successfully",
    data: {
      _id: parent._id,
      name: parent.name,
      email: parent.email,
      phone: parent.phone,
      role: parent.role,
      parentId: parent.parentId,
      children: parent.children,
    },
  });
});

//@desc Login parent
//@route POST /api/v1/parents/login
//@access Public
exports.parentLoginCtrl = AsyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  const parent = await Parent.findOne({ email: email.toLowerCase().trim() }).populate({
    path: "children",
    select: "name email studentId StudentId currentClassLevel isWithDrawn isSuspended",
  });

  if (!parent) {
    return res.status(401).json({
      status: "failed",
      message: "Invalid email or password",
    });
  }

  if (parent.isSuspended) {
    return res.status(403).json({
      status: "failed",
      message: "Your parent account has been suspended. Please contact school administration.",
    });
  }

  const isMatched = await isPasswordMatched(password, parent.password);
  if (!isMatched) {
    return res.status(401).json({
      status: "failed",
      message: "Invalid email or password",
    });
  }

  const token = generateToken(parent._id);

  res.status(200).json({
    status: "success",
    message: "Parent logged in successfully",
    token,
    data: token, // for compatibility with project token conventions
    user: {
      _id: parent._id,
      name: parent.name,
      email: parent.email,
      phone: parent.phone,
      role: parent.role || "parent",
      parentId: parent.parentId,
      children: parent.children,
    },
  });
});

//@desc Get current authenticated parent profile with linked children
//@route GET /api/v1/parents/profile
//@access Private (Parent)
exports.getParentProfileCtrl = AsyncHandler(async (req, res) => {
  const parent = await Parent.findById(req.userAuth._id).populate({
    path: "children",
    select: "name email studentId StudentId currentClassLevel isWithDrawn isSuspended classLevels",
  });

  if (!parent) {
    res.status(404);
    throw new Error("Parent profile not found");
  }

  res.status(200).json({
    status: "success",
    data: parent,
  });
});

//@desc Link a student to a parent
//@route POST /api/v1/parents/link-student
//@access Private (Admin or Parent)
exports.linkStudentToParentCtrl = AsyncHandler(async (req, res) => {
  const { parentId, studentIdentifier } = req.body;

  // Determine target parent
  const targetParentId = req.userAuth.role === "admin" && parentId ? parentId : req.userAuth._id;

  const parent = await Parent.findById(targetParentId);
  if (!parent) {
    res.status(404);
    throw new Error("Parent not found");
  }

  if (!studentIdentifier) {
    res.status(400);
    throw new Error("Student admission number (studentId) or email is required");
  }

  const student = await Student.findOne({
    $or: [
      { studentId: studentIdentifier.trim() },
      { StudentId: studentIdentifier.trim() },
      { email: studentIdentifier.trim().toLowerCase() },
    ],
  });

  if (!student) {
    res.status(404);
    throw new Error(`No student found with identifier "${studentIdentifier}"`);
  }

  // Prevent duplicate linking
  if (!parent.children.some((id) => id.toString() === student._id.toString())) {
    parent.children.push(student._id);
    await parent.save();
  }

  student.parent = parent._id;
  student.parentEmail = parent.email;
  await student.save();

  const updatedParent = await Parent.findById(parent._id).populate("children", "name email studentId StudentId currentClassLevel");

  res.status(200).json({
    status: "success",
    message: `Student "${student.name}" successfully linked to parent "${parent.name}"`,
    data: updatedParent,
  });
});

//@desc Get all parents (Admin only)
//@route GET /api/v1/parents
//@access Private (Admin)
exports.getAllParentsCtrl = AsyncHandler(async (req, res) => {
  const parents = await Parent.find()
    .select("-password")
    .populate("children", "name email studentId StudentId currentClassLevel")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    count: parents.length,
    data: parents,
  });
});
