const mongoose = require("mongoose");

const subjectResultSchema = new mongoose.Schema(
    {
        subject: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject",
            required: false,
        },
        subjectName: {
            type: String,
            required: true,
        },
        exam: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Exam",
            required: false,
        },
        examName: {
            type: String,
            default: "",
        },
        score: {
            type: Number,
            required: true,
            default: 0,
        },
        testScore: {
            type: Number,
            default: 0,
        },
        examScore: {
            type: Number,
            default: 0,
        },
        position: {
            type: Number,
            default: null,
        },
        positionFormatted: {
            type: String,
            default: "",
        },
        totalMark: {
            type: Number,
            required: true,
            default: 100,
        },
        // Normalized percentage score (preserved from ExamResult.grade)
        grade: {
            type: Number,
            required: true,
            default: 0,
        },
        letterGrade: {
            type: String,
            default: "F",
        },
        remarks: {
            type: String,
            default: "Poor",
        },
        status: {
            type: String,
            enum: ["Passed", "Failed"],
            default: "Passed",
        },
    },
    { _id: true }
);

const reviewHistorySchema = new mongoose.Schema(
    {
        action: {
            type: String,
            required: true,
            enum: ["submitted", "approved", "rejected", "published", "unpublished", "resubmitted"],
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "reviewHistory.performerModel",
        },
        performerModel: {
            type: String,
            enum: ["Admin", "Teacher"],
            default: "Admin",
        },
        performerName: {
            type: String,
            default: "",
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
        reason: {
            type: String,
            default: "",
        },
        previousStatus: {
            type: String,
            default: "",
        },
        newStatus: {
            type: String,
            default: "",
        },
    },
    { _id: true }
);

const studentReportCardSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },

        studentID: {
            type: String,
            required: true,
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

        program: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            default: null,
        },

        // Detailed subject results collected from existing ExamResult records
        subjectResults: [subjectResultSchema],

        totalScore: {
            type: Number,
            required: true,
            default: 0,
        },

        totalMaxScore: {
            type: Number,
            required: true,
            default: 0,
        },

        averageScore: {
            type: Number,
            required: true,
            default: 0,
        },

        position: {
            type: Number,
            required: true,
            default: 1,
        },

        positionFormatted: {
            type: String,
            default: "1st",
        },

        totalStudents: {
            type: Number,
            required: true,
            default: 0,
        },

        overallGrade: {
            type: String,
            default: "F",
        },

        overallRemark: {
            type: String,
            default: "Fair",
        },

        teacherComment: {
            type: String,
            default: "",
        },

        principalComment: {
            type: String,
            default: "",
        },

        promoted: {
            type: Boolean,
            default: false,
        },

        promotionStatus: {
            type: String,
            enum: ["Promoted", "Promoted on Trial", "Repeat", "Pending"],
            default: "Pending",
        },

        status: {
            type: String,
            enum: [
                "draft",
                "saved",
                "calculated",
                "submitted",
                "submitted_to_admin",
                "approved",
                "published",
                "rejected",
                "returned_for_correction",
                "resubmitted",
            ],
            default: "calculated",
        },

        published: {
            type: Boolean,
            default: false,
        },

        publishedAt: {
            type: Date,
            default: null,
        },

        publishedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },

        approvedAt: {
            type: Date,
            default: null,
        },

        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            default: null,
        },

        submittedAt: {
            type: Date,
            default: null,
        },

        rejectionReason: {
            type: String,
            default: "",
        },

        rejectedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },

        rejectedAt: {
            type: Date,
            default: null,
        },

        resubmittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            default: null,
        },

        resubmittedAt: {
            type: Date,
            default: null,
        },

        reviewHistory: [reviewHistorySchema],

        // Future-proof extensible fields
        attendance: {
            daysOpened: { type: Number, default: 0 },
            daysPresent: { type: Number, default: 0 },
            daysAbsent: { type: Number, default: 0 },
        },
        traits: {
            punctuality: { type: String, default: "Good" },
            attentiveness: { type: String, default: "Good" },
            neatness: { type: String, default: "Good" },
            politeness: { type: String, default: "Good" },
            teamwork: { type: String, default: "Good" },
        },
        nextTermBegins: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Pre-save hook: Ensure program is populated from student if missing
studentReportCardSchema.pre("save", async function (next) {
    if (!this.program && this.student) {
        try {
            const Student = mongoose.model("Student");
            const stu = await Student.findById(this.student).select("program");
            if (stu?.program) {
                this.program = stu.program;
            }
        } catch {
            // Ignore if student model not loaded yet
        }
    }
    next();
});

// Compound index to guarantee only one official report card per student per academicYear + academicTerm + classLevel
studentReportCardSchema.index(
    { student: 1, academicYear: 1, academicTerm: 1, classLevel: 1 },
    { unique: true }
);

studentReportCardSchema.index({ classLevel: 1, academicYear: 1, academicTerm: 1 });
studentReportCardSchema.index({ status: 1 });
studentReportCardSchema.index({ published: 1 });

const StudentReportCard = mongoose.model("StudentReportCard", studentReportCardSchema);

module.exports = StudentReportCard;
