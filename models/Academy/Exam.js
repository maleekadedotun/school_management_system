const mongoose = require("mongoose");

const examSchema = new mongoose.Schema(
    {
        name:{
            type: String,
            required: true,
        },

        description:{
            type: String,
            required: true,
        },

        subject:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subject",
            required: true,
        },

        program:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Program",
            required: true,
        },

        passMark:{
            type: Number,
            required: true,
            default: 40,
        },

        totalMark:{
            type: Number,
            required: true,
            default: 70,
        },

        academicTerm:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicTerm",
            required: true,
        },

        duration:{
            type: String,
            required: true,
            default: "30 minutes",
        },

        examDate:{
            type: Date,
            required: true,
            default: new Date(),
        },

        examTime:{
            type: String,
            required: true,
        },

        examType:{
            type: String,
            required: true,
            default: "Exam",
        },

        examStatus:{
            type: String,
            required: true,
            default: "pending",
            enum: ["pending", "live"],
        },

        questions:[
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Question",
            },
        ],

        classLevel: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ClassLevel",
            required: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            required: true,
        },

        academicYear: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicYear",
            required: true,
        },
        
    },
    
    {
        timestamps: true,
    }
);

// Auto-adjust passMark and totalMark based on examType if not explicitly customized
examSchema.pre("validate", function(next) {
    const isTest = ["test", "quiz", "continuous assessment", "ca"].includes((this.examType || "").toLowerCase());
    if (this.isNew || this.isModified("examType")) {
        if (!this.totalMark || this.totalMark === 100 || (isTest && this.totalMark === 70) || (!isTest && this.totalMark === 30)) {
            this.totalMark = isTest ? 30 : 70;
        }
        if (!this.passMark || this.passMark === 50 || (isTest && this.passMark === 40) || (!isTest && this.passMark === 15)) {
            this.passMark = isTest ? 15 : 40;
        }
    }
    next();
});

// model
// compile
const Exam = mongoose.model("Exam", examSchema)

module.exports = Exam;