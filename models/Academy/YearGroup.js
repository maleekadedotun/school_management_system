const mongoose = require("mongoose");

const yearGroupSchema = new mongoose.Schema(
    {
        name:{
            type: String,
            required: true,
        },

        createdBy: {
            types: Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },  

        academicYear: {
            types: Schema.Types.ObjectId,
            ref: "AcademicYear",
            required: true,
        },  
    },
    
    {
        timestamps: true,
    }
);

// model
// compile
const YearGroup = mongoose.model(YearGroup, "yearGroupSchema")

module.exports = YearGroup