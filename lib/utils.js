// contains helper functions such as initiating phone input
const { Markup } = require("telegraf");
const kopokopo = require("./kopo-kopo");
const Subscription = require("../models/subscriptionModel"); 

// function to initiate phone number input
const initiatePhoneNumberInput = (ctx, amount, subscription) => {
	// Request phone number
	ctx.reply(
		`Enter your phone number to initiate MPESA payment for KES: ${numberWithCommas(
			amount,
		)} for the ${subscription} subscription:`,
		Markup.keyboard([
			[
				Markup.button.callback("Change plan", "change_plan"),
				Markup.button.contactRequest("Share number"),
			],
		])
			.resize()
			.oneTime(),
	);
};

// formats numbers to present commas
const numberWithCommas = (x) => {
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

// validates number is valid & safaricom
const validatePhone = (phone) => {
	let safaricom =
		/^(0)|(254)?((?:(?:7(?:(?:[01249][0-9])|(?:5[789])|(?:6[89])))|(?:1(?:[1][0-5])))[0-9]{6})$/;

	let parsedPhone = String(phone);
	let validate = parsedPhone.match(safaricom);

	return Boolean(validate);
};

// plan selection
const plans = (ctx, userState) => {
	// get the user's name or use the username
	let user = ctx.from.username || ctx.from.first_name;
	
	userState.userId = ctx.from.id;
	userState.first_name = ctx.from.first_name || ctx.from.username;
	
	// generate message
	let message = `Hello ${user}!\n`;
	message += "Select a plan to proceed.\n";

	let markup = Markup.inlineKeyboard([
		[Markup.button.callback("Weekly @ KES: 70", "subscribe_weekly")],
		[Markup.button.callback("Monthly @ KES: 200", "subscribe_monthly")],
		[Markup.button.callback("Annually @ KES: 1200", "subscribe_annually")],
	]).oneTime();

	return ctx.reply(message, markup);
};

// initiate payment
const STK = async ( amount, phone, customerName, customerId, orderID, payment_details) => {
	try {
		let stk = await kopokopo.stkPush(
			amount, 
			phone, 
			customerName, 
			customerId, 
			orderID
		); 
		 
		if (stk) {
			let paymentId = stk.split("/"); 
			paymentId = paymentId[paymentId.length -1]; 
			await Subscription.findByIdAndUpdate(orderID, {paymentRef: paymentId, payment_details}); 
			return true
		};
		return false; 
	} catch (err) {
		console.log("ERROR", err)
		return false; 
	}

}

module.exports = {
	initiatePhoneNumberInput,
	plans,
	validatePhone,
	STK
};
