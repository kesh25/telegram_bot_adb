const mongoose = require("mongoose");

// db
// development db is also production db
// TREAD CAREFULLY HERE
let DB = process.env.DATABASE.replace(
	"<password>",
	process.env.DATABASE_PASSWORD,
);

mongoose.set("strictQuery", true);
let serverThroughDB = (server, PORT) =>
	mongoose
		.connect(DB, {})
		.then((con) => {
			console.log(`DB Connected, ${process.env.NODE_ENV}...!!`);
			return server.listen({ port: PORT });
		})
		.then(() => {
			console.log(`Server running on port ${PORT}`);
		});

module.exports = serverThroughDB;
