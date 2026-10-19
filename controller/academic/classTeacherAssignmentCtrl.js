const AsyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const ClassTeacherAssignment = require("../../models/Academy/ClassTeacherAssignment");
const Teacher = require("../../models/Staff/Teacher");
const ClassLevel = require("../../models/Academy/ClassLevel");
const Program = require("../../models/Academy/program");
const AcademicYear = require("../../models/Academy/AcademicYear");
const AcademicTerm = require("../../models/Academy/AcademicTerm");

//@desc Create a new Class Teacher Assignment
//@route POST /api/v1/class-teachers
//@access Private (Admin only)
exports.createAssignmentCtrl = AsyncHandler(async (req, res) => {
    const {
        teacherId,
        classLevelId,
        programId,
        academicYearId,
        academicTermId,
        notes,
    } = req.body;

    if (!teacherId || !classLevelId || !academicYearId) {
        return res.status(400).json({
            status: "failed",
            message: "Teacher, Class Level, and Academic Year are required fields.",
        });
    }

    if (!mongoose.Types.ObjectId.isValid(teacherId)) {
        return res.status(400).json({ status: "failed", message: "Invalid Teacher ID format." });
    }
    if (!mongoose.Types.ObjectId.isValid(classLevelId)) {
        return res.status(400).json({ status: "failed", message: "Invalid Class Level ID format." });
    }
    if (!mongoose.Types.ObjectId.isValid(academicYearId)) {
        return res.status(400).json({ status: "failed", message: "Invalid Academic Year ID format." });
    }

    // 1. Fetch and validate Teacher
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
        return res.status(404).json({
            status: "failed",
            message: "Teacher not found in the database.",
        });
    }

    // Check if teacher is inactive (withdrawn or suspended)
    if (teacher.isWithDrawn) {
        return res.status(400).json({
            status: "failed",
            message: `Cannot assign ${teacher.name}. This teacher is marked as withdrawn.`,
        });
    }
    if (teacher.isSuspended) {
        return res.status(400).json({
            status: "failed",
            message: `Cannot assign ${teacher.name}. This teacher is currently suspended.`,
        });
    }

    // 2. Validate ClassLevel & AcademicYear
    const [classLevel, academicYear] = await Promise.all([
        ClassLevel.findById(classLevelId),
        AcademicYear.findById(academicYearId),
    ]);
    if (!classLevel) {
        return res.status(404).json({ status: "failed", message: "Class Level not found." });
    }
    if (!academicYear) {
        return res.status(404).json({ status: "failed", message: "Academic Year not found." });
    }

    // 3. Optional Program & Term validation
    let validProgramId = null;
    if (programId && mongoose.Types.ObjectId.isValid(programId)) {
        const prog = await Program.findById(programId);
        if (prog) validProgramId = prog._id;
    }

    let validTermId = null;
    if (academicTermId && mongoose.Types.ObjectId.isValid(academicTermId)) {
        const term = await AcademicTerm.findById(academicTermId);
        if (term) validTermId = term._id;
    }

    // 4. Check for conflicting active assignment for the same classLevel + program + academicYear
    const conflictQuery = {
        classLevel: classLevelId,
        academicYear: academicYearId,
        program: validProgramId,
        isActive: true,
    };
    if (validTermId) {
        conflictQuery.$or = [{ academicTerm: validTermId }, { academicTerm: null }];
    }

    const existingActiveAssignment = await ClassTeacherAssignment.findOne(conflictQuery)
        .populate("teacher", "name email teacherId")
        .populate("classLevel", "name")
        .populate("academicYear", "name");

    if (existingActiveAssignment) {
        const assignedTeacherName = existingActiveAssignment.teacher?.name || "another teacher";
        return res.status(409).json({
            status: "failed",
            message: `Conflict: ${classLevel.name} already has an active class teacher (${assignedTeacherName}) for academic year ${academicYear.name}. Please deactivate the existing assignment first.`,
            existingAssignment: existingActiveAssignment,
        });
    }

    // 5. Create new assignment
    const newAssignment = await ClassTeacherAssignment.create({
        teacher: teacher._id,
        classLevel: classLevel._id,
        program: validProgramId,
        academicYear: academicYear._id,
        academicTerm: validTermId,
        assignedBy: req.userAuth._id,
        isActive: true,
        status: "active",
        notes: (notes || "").trim(),
    });

    const populated = await ClassTeacherAssignment.findById(newAssignment._id)
        .populate("teacher", "name email teacherId isWithDrawn isSuspended")
        .populate("classLevel", "name description")
        .populate("program", "name code")
        .populate("academicYear", "name isCurrent")
        .populate("academicTerm", "name")
        .populate("assignedBy", "name email");

    res.status(201).json({
        status: "Success",
        message: `Successfully assigned ${teacher.name} as class teacher for ${classLevel.name}.`,
        data: populated,
    });
});

//@desc Get all Class Teacher Assignments with filters
//@route GET /api/v1/class-teachers
//@access Private (Admin only)
exports.getAssignmentsCtrl = AsyncHandler(async (req, res) => {
    const { classLevel, program, academicYear, teacher, status, isActive } = req.query;

    const filter = {};
    if (classLevel && mongoose.Types.ObjectId.isValid(classLevel)) {
        filter.classLevel = classLevel;
    }
    if (program && mongoose.Types.ObjectId.isValid(program)) {
        filter.program = program;
    }
    if (academicYear && mongoose.Types.ObjectId.isValid(academicYear)) {
        filter.academicYear = academicYear;
    }
    if (teacher && mongoose.Types.ObjectId.isValid(teacher)) {
        filter.teacher = teacher;
    }
    if (status && status !== "all") {
        filter.status = status;
    }
    if (isActive !== undefined && isActive !== "all") {
        filter.isActive = isActive === "true" || isActive === true;
    }

    const assignments = await ClassTeacherAssignment.find(filter)
        .populate("teacher", "name email teacherId isWithDrawn isSuspended dateEmployed")
        .populate("classLevel", "name description")
        .populate("program", "name code")
        .populate("academicYear", "name isCurrent fromYear toYear")
        .populate("academicTerm", "name")
        .populate("assignedBy", "name email")
        .sort({ createdAt: -1 });

    res.status(200).json({
        status: "Success",
        message: "Class teacher assignments fetched successfully",
        total: assignments.length,
        data: assignments,
    });
});

//@desc Get logged-in Teacher's own Class Teacher Assignments
//@route GET /api/v1/class-teachers/my-assignments
//@access Private (Teacher only)
exports.getMyAssignmentsCtrl = AsyncHandler(async (req, res) => {
    const teacherId = req.userAuth?._id;
    if (!teacherId) {
        return res.status(401).json({ status: "failed", message: "Teacher authentication required." });
    }

    // Fetch active assignments for this teacher
    const assignments = await ClassTeacherAssignment.find({
        teacher: teacherId,
        isActive: true,
    })
        .populate("classLevel", "name description")
        .populate("program", "name code")
        .populate("academicYear", "name isCurrent fromYear toYear")
        .populate("academicTerm", "name")
        .sort({ createdAt: -1 });

    // Fallback: If no explicit records exist in ClassTeacherAssignment yet, check Teacher profile legacy fields
    if (assignments.length === 0) {
        const teacherDoc = await Teacher.findById(teacherId);
        if (teacherDoc?.classLevel) {
            let matchedClass = null;
            if (mongoose.Types.ObjectId.isValid(teacherDoc.classLevel)) {
                matchedClass = await ClassLevel.findById(teacherDoc.classLevel);
            } else {
                matchedClass = await ClassLevel.findOne({
                    name: { $regex: new RegExp(`^${teacherDoc.classLevel.trim()}$`, "i") },
                });
            }

            if (matchedClass) {
                const currentYear = await AcademicYear.findOne({ isCurrent: true }) || await AcademicYear.findOne().sort({ createdAt: -1 });
                const currentTerm = await AcademicTerm.findOne().sort({ createdAt: -1 });

                return res.status(200).json({
                    status: "Success",
                    message: "Active assignments fetched successfully (legacy profile fallback)",
                    data: [
                        {
                            _id: `legacy-${teacherDoc._id}-${matchedClass._id}`,
                            teacher: teacherDoc._id,
                            classLevel: matchedClass,
                            program: null,
                            academicYear: currentYear,
                            academicTerm: currentTerm,
                            isActive: true,
                            status: "active",
                            isLegacyFallback: true,
                        },
                    ],
                });
            }
        }
    }

    res.status(200).json({
        status: "Success",
        message: "Active class teacher assignments fetched successfully",
        total: assignments.length,
        data: assignments,
    });
});

//@desc Get eligible teachers from database for assignment dropdown
//@route GET /api/v1/class-teachers/eligible-teachers
//@access Private (Admin or authenticated staff)
exports.getEligibleTeachersCtrl = AsyncHandler(async (req, res) => {
    const teachers = await Teacher.find()
        .select("_id name email teacherId isWithDrawn isSuspended dateEmployed subject subjects")
        .sort({ name: 1 });

    res.status(200).json({
        status: "Success",
        message: "Eligible teachers fetched successfully",
        total: teachers.length,
        data: teachers,
    });
});

//@desc Get single Class Teacher Assignment by ID
//@route GET /api/v1/class-teachers/:id
//@access Private (Admin or assigned Teacher)
exports.getSingleAssignmentCtrl = AsyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(404).json({ status: "failed", message: "Assignment not found." });
    }

    const assignment = await ClassTeacherAssignment.findById(req.params.id)
        .populate("teacher", "name email teacherId isWithDrawn isSuspended")
        .populate("classLevel", "name description")
        .populate("program", "name code")
        .populate("academicYear", "name isCurrent")
        .populate("academicTerm", "name")
        .populate("assignedBy", "name email");

    if (!assignment) {
        return res.status(404).json({ status: "failed", message: "Assignment not found." });
    }

    res.status(200).json({
        status: "Success",
        data: assignment,
    });
});

//@desc Update an existing Class Teacher Assignment
//@route PUT /api/v1/class-teachers/:id
//@access Private (Admin only)
exports.updateAssignmentCtrl = AsyncHandler(async (req, res) => {
    const assignmentId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
        return res.status(404).json({ status: "failed", message: "Assignment not found." });
    }

    const assignment = await ClassTeacherAssignment.findById(assignmentId);
    if (!assignment) {
        return res.status(404).json({ status: "failed", message: "Assignment not found." });
    }

    const {
        teacherId,
        classLevelId,
        programId,
        academicYearId,
        academicTermId,
        notes,
        isActive,
        status,
    } = req.body;

    const targetTeacherId = teacherId || assignment.teacher;
    const targetClassId = classLevelId || assignment.classLevel;
    const targetYearId = academicYearId || assignment.academicYear;
    const targetProgramId = programId !== undefined ? (programId || null) : assignment.program;
    const targetIsActive = isActive !== undefined ? Boolean(isActive) : assignment.isActive;

    // If changing teacher, ensure new teacher is active
    if (teacherId && teacherId.toString() !== assignment.teacher.toString()) {
        const newTeacher = await Teacher.findById(teacherId);
        if (!newTeacher) {
            return res.status(404).json({ status: "failed", message: "New teacher not found." });
        }
        if (newTeacher.isWithDrawn || newTeacher.isSuspended) {
            return res.status(400).json({
                status: "failed",
                message: `Cannot assign ${newTeacher.name}. This teacher is ${newTeacher.isWithDrawn ? "withdrawn" : "suspended"}.`,
            });
        }
        assignment.teacher = newTeacher._id;
    }

    // If active, ensure no other active assignment exists for this class/program/year
    if (targetIsActive) {
        const conflict = await ClassTeacherAssignment.findOne({
            _id: { $ne: assignmentId },
            classLevel: targetClassId,
            academicYear: targetYearId,
            program: targetProgramId,
            isActive: true,
        }).populate("teacher", "name");

        if (conflict) {
            return res.status(409).json({
                status: "failed",
                message: `Conflict: An active class teacher (${conflict.teacher?.name || "another teacher"}) already exists for this class and year.`,
            });
        }
    }

    if (classLevelId) assignment.classLevel = classLevelId;
    if (programId !== undefined) assignment.program = programId || null;
    if (academicYearId) assignment.academicYear = academicYearId;
    if (academicTermId !== undefined) assignment.academicTerm = academicTermId || null;
    if (notes !== undefined) assignment.notes = notes;
    if (isActive !== undefined) {
        assignment.isActive = targetIsActive;
        assignment.status = targetIsActive ? "active" : "inactive";
    }
    if (status) {
        assignment.status = status;
        assignment.isActive = status === "active";
    }

    await assignment.save();

    const updated = await ClassTeacherAssignment.findById(assignmentId)
        .populate("teacher", "name email teacherId isWithDrawn isSuspended")
        .populate("classLevel", "name description")
        .populate("program", "name code")
        .populate("academicYear", "name isCurrent")
        .populate("academicTerm", "name")
        .populate("assignedBy", "name email");

    res.status(200).json({
        status: "Success",
        message: "Class teacher assignment updated successfully.",
        data: updated,
    });
});

//@desc Toggle active / inactive status of Class Teacher Assignment
//@route PATCH /api/v1/class-teachers/:id/status
//@access Private (Admin only)
exports.toggleStatusCtrl = AsyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(404).json({ status: "failed", message: "Assignment not found." });
    }

    const assignment = await ClassTeacherAssignment.findById(req.params.id);
    if (!assignment) {
        return res.status(404).json({ status: "failed", message: "Assignment not found." });
    }

    const nextActive = !assignment.isActive;

    if (nextActive) {
        // Check for conflicts before reactivating
        const conflict = await ClassTeacherAssignment.findOne({
            _id: { $ne: assignment._id },
            classLevel: assignment.classLevel,
            academicYear: assignment.academicYear,
            program: assignment.program,
            isActive: true,
        }).populate("teacher", "name");

        if (conflict) {
            return res.status(409).json({
                status: "failed",
                message: `Cannot activate: ${conflict.teacher?.name || "Another teacher"} is already actively assigned to this class and academic year.`,
            });
        }

        // Verify teacher is not withdrawn or suspended
        const teacher = await Teacher.findById(assignment.teacher);
        if (teacher && (teacher.isWithDrawn || teacher.isSuspended)) {
            return res.status(400).json({
                status: "failed",
                message: `Cannot activate: Teacher ${teacher.name} is ${teacher.isWithDrawn ? "withdrawn" : "suspended"}.`,
            });
        }
    }

    assignment.isActive = nextActive;
    assignment.status = nextActive ? "active" : "inactive";
    await assignment.save();

    const updated = await ClassTeacherAssignment.findById(assignment._id)
        .populate("teacher", "name email teacherId")
        .populate("classLevel", "name")
        .populate("program", "name")
        .populate("academicYear", "name");

    res.status(200).json({
        status: "Success",
        message: `Assignment marked as ${assignment.status} successfully.`,
        data: updated,
    });
});

//@desc Delete Class Teacher Assignment
//@route DELETE /api/v1/class-teachers/:id
//@access Private (Admin only)
exports.deleteAssignmentCtrl = AsyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(404).json({ status: "failed", message: "Assignment not found." });
    }

    const assignment = await ClassTeacherAssignment.findById(req.params.id);
    if (!assignment) {
        return res.status(404).json({ status: "failed", message: "Assignment not found." });
    }

    await ClassTeacherAssignment.findByIdAndDelete(req.params.id);

    res.status(200).json({
        status: "Success",
        message: "Class teacher assignment deleted successfully.",
    });
});
