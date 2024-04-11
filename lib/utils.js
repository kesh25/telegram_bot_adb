// contains helper functions such as initiating phone input
const { Markup } = require("telegraf");
const kopokopo = require("./kopo-kopo");
const Subscription = require("../models/subscriptionModel"); 
const cache = require("../utils/cache"); 
// function to initiate phone number input
const initiatePhoneNumberInput = (ctx, amount, subscription) => {
	// Request phone number
	ctx.reply(
		`Enter your phone number to initiate Mpesa payment of KES: ${numberWithCommas(
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

const setupUser = (ctx) => {
	let users = cache.getItem("users") || {}; 

	let user = users[ctx.from.id] || null; 

	if (!user) {
		user = {
			userId: ctx.from.id, 
			first_name: ctx.from.first_name, 
			last_name: ctx.from.last_name, 
			user_name: ctx.from.username,
		}
		users[ctx.from.id] = user; 
		cache.setItem("users", users)
	}

	return user; 
};

const updateUsersCache = (telegramId, userId, phone, amount, subscription) => {
	let users = cache.getItem("users"); 
	let user = users[telegramId]; 

	if (userId) {
		user.id = userId; 
		user.registered = true; 
	}
	if (amount) user.amount = amount; 
	if (subscription) user.subscription = subscription; 
	if (phone) user.phoneNumber = phone; 

	users[telegramId] = user; 
	cache.setItem("users", users)
}

// plan selection
const plans = (ctx) => {
	try {
		let user = setupUser(ctx)
		// get the user's name or use the username
		let name = user.username || user.first_name;
		
		// userState.userId = ctx.from.id;
		// userState.first_name = ctx.from.first_name || ctx.from.username;
		
		// generate message
		let message = `Hello ${name}!\n`;
		message += "Select a plan to proceed.\n";
	
		let markup = Markup.inlineKeyboard([
			[Markup.button.callback("Weekly @ KES: 70", "subscribe_weekly")],
			[Markup.button.callback("Monthly @ KES: 200", "subscribe_monthly")],
			[Markup.button.callback("Annually @ KES: 1200", "subscribe_annually")],
		]).oneTime();
	
		return ctx.reply(message, markup);

	} catch (err) {console.log(err)}
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
	STK,
	setupUser,
	updateUsersCache
};
