// bot actions
const { Markup } = require("telegraf");
const { v4: uuidv4 } = require('uuid');

const { initiatePhoneNumberInput, validatePhone } = require("./utils");
const { plans } = require("./utils");

//models
const User = require("../models/userModel");
const Subscription = require("../models/subscriptionModel");
const MPESA = require("./mpesa");

// handle subscription handlers
const handleSubscription = (ctx, type, amount, userState) => {
	ctx.answerCbQuery(`Subscribing to ${type} plan.`);
	initiatePhoneNumberInput(ctx, amount, type);
	// update state variable...
	userState.subscription = type;
	userState.amount = Number(amount);
};

// payment prompt
const handlePaymentPrompt = async (type, ctx, userState) => {
	const userId = ctx.from.id;
	let phoneNumber =
		type === "text" ? ctx.message.text : ctx.message.contact.phone_number;

	if (type === "text" && ctx.message.text === "/subscribe") {
		return plans(ctx, userState)
	}

	if (type === "contact") phoneNumber = phoneNumber.slice(1,); 
	// validate phone number if is safaricom
	// validatePhone
	if (!validatePhone(phoneNumber)) {
		return ctx.reply(
			"Invalid phone number. Please enter a valid Safaricom phone number.",
		);
	}

	// save user phone number to state
	userState.phoneNumber = phoneNumber;

	// handle saving the user
	let user = await User.findOne({ user_id: userId });
	if (user) {
		userState.registered = true;
		userState.id = user.id;
	}
	if (!userState.registered) {
		user = await User.create({
			user_id: userId,
			first_name: ctx.from.first_name,
			last_name: ctx.from.last_name || "",
		});
		userState.id = user.id;
	}

	// if user has an active or pending subscription
	let activeSubscriptions = await Subscription.find({
		user: userState.id,
		status: "active",
	});
	if (activeSubscriptions.length > 0) {
		return ctx.reply("You already have an active subscription.");
	}

	// if user has a pending subscription update it
	// else - create one
	let pendingSubscriptions = await Subscription.find({
		user: userState.id,
		status: "pending",
	});

	// to hold the subscription ID; 
	let subscriptionID; 
	let payment_details = {
		amount: userState.amount,
		mpesa_no: phoneNumber,
	}
	if (pendingSubscriptions.length === 0) {
		// create subscription
		let subscription = {
			user: userState.id,
			subscription: userState.subscription,
			phoneNumber: phoneNumber,
			payment_details,
			paymentRef: uuidv4()
		};

		let subscriptionDoc = await Subscription.create(subscription);
		subscriptionID = subscriptionDoc.id; 
	} else {
		// if user has a pending subscription
		// update that subscription
		subscriptionID = pendingSubscriptions[0].id; 
		await Subscription.findByIdAndUpdate(pendingSubscriptions[0].id, {
			subscription: userState.subscription,
			phoneNumber,
			payment_details,
		});
	}

	// initiate mpesa prompt from here
	// get mpesa - CheckoutRequestID and update subscription doc with it
	let amount = process.env.NODE_ENV === "development" ? 1: userState.amount; 
	let mpesa = new MPESA(phoneNumber, amount);
	let stk = await mpesa.STKPush();

	console.log(stk)

	if (stk?.status !== "success") {
		return ctx.reply("Server error, try again later!")
	} else {
		await Subscription.findByIdAndUpdate(subscriptionID, {paymentRef: stk.data.CheckoutRequestID, payment_details: {...payment_details, ...stk.data}}); 
	}


	return ctx.reply(
		`Please enter your M-Pesa pin to pay KES: ${userState.amount}.`,
		Markup.inlineKeyboard([
			Markup.button.callback("Retry payment", "retry_mpesa"),
			Markup.button.callback("Check payment status", "payment_status"),
		]),
	);
};

// retry mpesa
const handleRetryMpesa = async (ctx, userState) => {
	// get phone number from state
	let { phoneNumber, userId } = userState;
	let amount = userState.amount; 

	// if no phoneNumber
	if (!phoneNumber) return plans(ctx, userState);


	// get the pending subscription from db
	let subscription = await Subscription.findOne({user_id: userId, status: "pending"})

	// if no subscription is pending 
	if (!subscription) {
		ctx.reply("You have no pending subscription. \n Select a plan to start.")
		return plans(ctx, userState); 
	}

	
	// if subscription present
	let subscriptionID = subscription.id; 

	// initiate mpesa payment prompt here
	 amount = process.env.NODE_ENV === "development" ? 1: subscription.payment_details.amount; 
	// get mpesa - CheckoutRequestID and update subscription doc with it
	let mpesa = new MPESA(phoneNumber, amount);
	let stk = await mpesa.STKPush();

	if (stk.status !== "success") {
		return ctx.reply("Server error, try again later!")
	} else {
		await Subscription.findByIdAndUpdate(subscriptionID, {paymentRef: stk.data.CheckoutRequestID, payment_details: {...subscription.payment_details, ...stk.data}}); 
	}

	return ctx.reply(
		`Please enter your M-Pesa pin to pay KES: ${amount}.`,
		Markup.inlineKeyboard([
			Markup.button.callback("Retry payment", "retry_mpesa"),
			Markup.button.callback("Check payment status", "payment_status"),
		]),
	);
};

// check mpesa statement
const handleCheckMpesaStatus = async (ctx, userState) => {
	// get user 
	let user = await User.findOne({user_id: userState.userId}); 

	if (user) {
		// check user subscriptions and get most recent one 
		let subscriptions = await Subscription.find({user: user.id}).sort({createdAt: -1}).limit(1); 
		if (subscriptions.length === 0) {
			ctx.reply("You have no pending subscription"); 
			plans(ctx, userState); 
			return; 
		}
		let status = subscriptions[0].status; 

		let message = status === "pending" ? "Payment is still pending.": status === "active" ? "": `Payment failed - ${subscriptions[0].payment_details.ResultDec || ""}`; 

		ctx.reply(message); 
	}
};

module.exports = {
	handleCheckMpesaStatus,
	handlePaymentPrompt,
	handleRetryMpesa,
	handleSubscription,
};
