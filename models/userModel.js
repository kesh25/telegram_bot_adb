// user model
const mongoose = require("mongoose");

const schemaOptions = {
	toJSON: { virtuals: true },
	toObject: { virtuals: true },
};
 
const UserSchema = new mongoose.Schema(
	{
		user_id: {
			type: String,
			unique: true,
			required: [true, "User id is required"],
		},
		first_name: {
			type: String,
			required: [true, "First name is required"],
		},
		last_name: String,
		createdAt: {
			type: Date,
			default: Date.now,
		},
	},
	schemaOptions,
);

const User = mongoose.model("User", UserSchema);

module.exports = User;
