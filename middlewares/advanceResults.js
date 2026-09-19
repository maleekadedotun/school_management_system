const advanceResults = (model, populate) => {
    return async (req, res, next) => {
        let filter = {};

        // Filtering by name
        if (req.query.name) {
            filter.name = { $regex: req.query.name, $options: "i" };
        }

        // Filtering by email
        if (req.query.email) {
            filter.email = { $regex: req.query.email, $options: "i" };
        }

        // Search query across multiple fields (name, email, subject, teacherId)
        if (req.query.search) {
            const searchRegex = { $regex: req.query.search, $options: "i" };
            filter.$or = [
                { name: searchRegex },
                { email: searchRegex },
                { subject: searchRegex },
                { teacherId: searchRegex }
            ];
        }

        let query = model.find(filter);

        if (populate) {
            query = query.populate(populate);
        }

        const totalRecords = await model.countDocuments(filter);
        const pagination = {};

        let results;

        // Apply pagination ONLY if page or limit query parameter is provided
        if (req.query.page || req.query.limit) {
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const startIndex = (page - 1) * limit;
            const endIndex = page * limit;

            if (endIndex < totalRecords) {
                pagination.next = {
                    page: page + 1,
                    limit,
                };
            }
            if (startIndex > 0) {
                pagination.prev = {
                    page: page - 1,
                    limit,
                };
            }

            results = await query.skip(skip).limit(limit);
        } else {
            // Return all records matching the filter when pagination params are not passed
            results = await query;
        }

        res.results = {
            results: results.length,
            totalRecords,
            pagination,
            status: "Success",
            message: "Fetched successfully",
            data: results,
        };

        next();
    };
};

module.exports = advanceResults;