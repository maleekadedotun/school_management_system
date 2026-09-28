const mongoose = require("mongoose");

const examResultsSchema = new mongoose.Schema(
    {
        studentID:{
            type: String,
            required: true,
        },

        exam:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Exam",
            required: true,
        },

        grade:{
            type: Number,
            required: true,
        },

        // program:{
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: "Program",
        //     required: true,
        // },

        score:{
            type: Number,
            required: true,
        },

        passMark:{
            type: Number,
            required: true,
            default: 50,
        },
        answeredQuestions: [
            {
                type: Object,
            }
        ],

        status:{
            type: String,
            required: true,
            enum: ["Failed", "Passed"],
            default: "Failed",
        },

        // Excellent/Good/Poor

        remarks:{
            type: String,
            required: true,
            enum: ["Excellent", "Very Good", "Good", "Fair", "Poor"],
            default: "Poor",
        },

        // position:{
        //     type: Number,
        //     required: true,
        // },

        // subject:{
        //     type: String,
        //     ref: "Subject",
        // },

        classLevel:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
        },

        academicTerm:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicTerm",
            required: true,
        },

        academicYear:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicYear",
            required: true,
        },

        // Tier 1: Teacher review & publication
        isTeacherPublished:{
            type: Boolean,
            default: false,
        },
        teacherPublishedAt:{
            type: Date,
        },
        teacherPublishedBy:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
        },

        // Tier 2: Admin final publication (releases result to student)
        isPublished:{
            type: Boolean,
            default: false,
        },
        adminPublishedAt:{
            type: Date,
        },
        adminPublishedBy:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
        },

    },
    
    {
        timestamps: true,
    }
);

// model
// compile
const ExamResults = mongoose.model("ExamResults", examResultsSchema)

module.exports = ExamResults;