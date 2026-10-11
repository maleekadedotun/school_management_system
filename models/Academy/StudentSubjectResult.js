const mongoose = require("mongoose");

const studentSubjectResultSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },
        studentID: {
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
        classLevel: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
            required: true,
        },
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject",
            required: true,
        },
        subjectName: {
            type: String,
            required: true,
            trim: true,
        },

        // Test / Continuous Assessment = 30 marks max
        testScore: {
            type: Number,
            required: true,
            min: [0, "Test score cannot be negative"],
            max: [30, "Test score cannot exceed 30 marks"],
        },

        // Examination = 70 marks max
        examScore: {
            type: Number,
            required: true,
            min: [0, "Exam score cannot be negative"],
            max: [70, "Exam score cannot exceed 70 marks"],
        },

        // Total score = testScore + examScore (Max 100)
        totalScore: {
            type: Number,
            required: true,
            min: [0, "Total score cannot be negative"],
            max: [100, "Total score cannot exceed 100"],
        },

        // grade = percentage preserved (same meaning as existing system)
        grade: {
            type: Number,
            required: true,
            min: [0, "Grade cannot be negative"],
            max: [100, "Grade cannot exceed 100"],
        },

        // Remark: Excellent, Very Good, Good, Fair, Poor
        remark: {
            type: String,
            required: true,
            enum: ["Excellent", "Very Good", "Good", "Fair", "Poor"],
            default: "Poor",
        },

        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            required: true,
        },

        recordedAt: {
            type: Date,
            default: Date.now,
        },

        status: {
            type: String,
            enum: ["draft", "saved", "submitted", "approved", "published"],
            default: "saved",
        },
    },
    {
        timestamps: true,
    }
);

// Auto-calculate totalScore, grade, and remark before validation
studentSubjectResultSchema.pre("validate", function (next) {
    if (this.testScore !== undefined && this.examScore !== undefined) {
        const total = Number(this.testScore) + Number(this.examScore);
        this.totalScore = total;
        this.grade = total;
        if (total >= 80) this.remark = "Excellent";
        else if (total >= 70) this.remark = "Very Good";
        else if (total >= 60) this.remark = "Good";
        else if (total >= 40) this.remark = "Fair";
        else this.remark = "Poor";
    }
    next();
});

// Prevent duplicate records for the same student + academicYear + academicTerm + classLevel + subject
studentSubjectResultSchema.index(
    { student: 1, academicYear: 1, academicTerm: 1, classLevel: 1, subject: 1 },
    { unique: true }
);

const StudentSubjectResult = mongoose.model("StudentSubjectResult", studentSubjectResultSchema);

module.exports = StudentSubjectResult;
