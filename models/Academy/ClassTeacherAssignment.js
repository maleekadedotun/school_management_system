const mongoose = require("mongoose");

const classTeacherAssignmentSchema = new mongoose.Schema(
    {
        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            required: [true, "Teacher reference is required"],
        },
        classLevel: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
            required: [true, "Class level is required"],
        },
        program: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            default: null,
        },
        academicYear: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicYear",
            required: [true, "Academic year is required"],
        },
        academicTerm: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicTerm",
            default: null,
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active",
        },
        notes: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index to quickly find active assignments

classTeacherAssignmentSchema.index(
    { classLevel: 1, program: 1, academicYear: 1, isActive: 1 },
    { name: "class_program_year_active_idx" }
);

classTeacherAssignmentSchema.index(
    { teacher: 1, academicYear: 1, isActive: 1 },
    { name: "teacher_year_active_idx" }
);

const ClassTeacherAssignment =
    mongoose.models.ClassTeacherAssignment || 
    mongoose.model("ClassTeacherAssignment", classTeacherAssignmentSchema);

module.exports = ClassTeacherAssignment;