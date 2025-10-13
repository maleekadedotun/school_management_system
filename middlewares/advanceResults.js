// model, populate

const advanceResults = (model, populate) =>{
    return async(req, res, next) => {
        // console.log("Advance Results");
        // // add user into the res
        // res.myData = {
        //     name: "John Doe",
        //     age: 22,
        // }

         let TeacherQuery = model.find();
            // convert string to number
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 2;
            const totalRecords = await model.countDocuments();
            const skip = (page - 1) * limit;
            const startIndex = (page - 1) * limit;
            const endIndex = page * limit;

            // populate
            if (populate) {
                TeacherQuery = TeacherQuery.populate(populate)
            }
        
            // filtering by name / searching
            if (req.query.name) {
                TeacherQuery = TeacherQuery.find({
                  name: {$regex: req.query.name, $options: "i"}
                });
            }
           
            // pagination results
            const pagination = {};
            // add next
            if (endIndex < totalRecords) {
                pagination.next = {
                    page: page + 1,
                    limit,
                }
            };
            if (startIndex > 0) {
                pagination.prev = {
                    page: page - 1,
                    limit,
                }
            }
            const teachers = await TeacherQuery.find().skip(skip).limit(limit);

            res.results = {
            // status(201).json({
                results: teachers.length,
                totalRecords,
                pagination,
                status: "Success",
                message: "Teachers fetched successfully",
                data: teachers,
            // });
            }
        
            
        next();

    }
}

module.exports = advanceResults;