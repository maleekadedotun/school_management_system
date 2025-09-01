const mongoose = require("mongoose");

const academicYearSchema = new mongoose.Schema(
    {
        name:{
            type: String,
            required: true,
        },

        fromYear:{
            type: Date,
            required: true,
        },

        toYear:{
            type: Date,
            required: true,
        },

        isCurrent:{
            type: Boolean,
            default: false,
        },

        students: {
            type: Schema.Types.ObjectId,
            ref: "Student",
        },

        teachers: {
            type: Schema.Types.ObjectId,
            ref: "Teachers",
        },    
    },
    
    {
        timestamps: true,
    }
);

// model
const AcademicYear = mongoose.model(AcademicYear, "academicYearSchema")

module.exports = AcademicYear