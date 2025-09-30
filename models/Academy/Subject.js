const mongoose = require("mongoose");

const SubjectSchema = new mongoose.Schema(
    {
        name:{
            type: String,
            required: true,
        },

        description:{
            type: String,
            required: true,
        },

        teacher:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
        },

        academicTerms:{
            type: mongoose.Schema.Types.ObjectId,
            ref: "AcademicTerm",
            required: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },

        // duration: {
        //     type: mongoose.Schema.Types.ObjectId,
        //     required: true,
        //     default: "3 months",
        // },  
        
        duration: {
            type: String,
            required: true,
            default: "3 months",
        },

    },

    {
        timestamps: true,
    }
);

// model
const Subject = mongoose.model("Subject", SubjectSchema)

module.exports = Subject