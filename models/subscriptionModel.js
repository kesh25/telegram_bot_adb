// subscriptions model
const mongoose = require("mongoose");

const schemaOptions = {
	toJSON: { virtuals: true },
	toObject: { virtuals: true },
};

const SubscriptionSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.ObjectId,
			ref: "User",
			required: true,
		},
		subscription: {
			type: String,
			enum: {
				values: ["weekly", "monthly", "annual", "premium"],
				message: "Subscription is not allowed.",
			},
		},
		premium: {
			type: Boolean, 
			default: false, 
		},
		status: {
			type: String,
			enum: {
				values: ["pending", "active", "ended", "failed"],
				message: "Status is not allowed.",
			},
			default: "pending",
		},
		createdAt: {
			type: Date,
			default: Date.now,
		},
		payment_type: {
			type: String,
			enum: {
				values: ["MPESA", "PayPal"],
				message: "Payment type is not allowed.",
			},
			default: "MPESA",
		},
		paymentRef: {
			type: String, 
			unique: true
		},
		phoneNumber: String,
		payment_details: Object,
		commence_at: Date,
		expires_at: Date,
	},
	schemaOptions,
);

const Subscription = mongoose.model("Subscription", SubscriptionSchema);

module.exports = Subscription;
