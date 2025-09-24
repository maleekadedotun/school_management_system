const mongoose = require("mongoose");

const dbConnect = async () =>{    
    try {
    // console.log(process.env);

        await mongoose.connect(process.env.MONGODB_URL)
        console.log("Database connected Successfully");
        
    } catch (error) {
        console.log("Database connection failed", error.message);
        
    }
}

dbConnect();