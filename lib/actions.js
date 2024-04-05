// bot actions
const { Markup } = require("telegraf");
const { v4: uuidv4 } = require("uuid");

const { initiatePhoneNumberInput, validatePhone, STK, setupUser, updateUsersCache } = require("./utils");
const { plans } = require("./utils");

//models
const User = require("../models/userModel");
const Subscription = require("../models/subscriptionModel");
// const MPESA = require("./mpesa");
// const KopoKopo = require("./kopo-kopo");

const botInstance = require("./bot");
// const cache = require("../utils/cache");

// handle subscription handlers
const handleSubscription = (ctx, type, amount) => {
  ctx.answerCbQuery(`Subscribing to ${type} plan.`);
  initiatePhoneNumberInput(ctx, amount, type);
  // update state variable...
   
  let user = setupUser(ctx); 
  user.subscription = type; 
  user.amount = Number(amount); 

  updateUsersCache(ctx.from.id, null, null, Number(amount), type)

  // userState.subscription = type;
  // userState.amount = Number(amount);
};

// payment prompt
const handlePaymentPrompt = async (type, ctx) => {
  let userState = setupUser(ctx); 

  const userId = userState.userId; 

  // ctx.from.id;
  let phoneNumber =
    type === "text" ? ctx.message.text : ctx.message.contact.phone_number;

  if (type === "text" && ctx.message.text.startsWith("/")) {
    let command = ctx.message.text;
    if (command === "/subscribe") return plans(ctx, userState);
    if (command === "/confirm") return await handleConfirm(ctx, userState);
    return ctx.reply(
      "Invalid command. Here is a list of commands \n /start - to start the bot \n /subscribe - to initiate subscription \n /confirm - to confirm whether you are in the channel!"
    );
  }

  if (type === "contact") phoneNumber = phoneNumber.slice(1);
  // validate phone number if is safaricom
  // validatePhone
  if (!validatePhone(phoneNumber)) {
    return ctx.reply(
      "Invalid phone number. Please enter a valid Safaricom phone number."
    );
  }

  // save user phone number to state
  if (phoneNumber.startsWith("0")) phoneNumber = `254${phoneNumber.slice(1)}`;
  phoneNumber = `+${phoneNumber}`;
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
    userState.registered = true;
  }

  updateUsersCache(ctx.from.id, user.id, phoneNumber); 
  

  // if user has an active or pending subscription
  let activeSubscriptions = await Subscription.find({
    user: user.id,
    status: "active",
  });

  if (activeSubscriptions.length > 0) {
    return ctx.reply("You already have an active subscription.");
  }

  // if user has a pending subscription update it
  // else - create one
  let pendingSubscriptions = await Subscription.find({
    user: user.id,
    status: "pending",
  });

  // to hold the subscription ID;
  let subscriptionID;
  let payment_details = {
    amount: userState.amount,
    mpesa_no: phoneNumber,
  };
  if (pendingSubscriptions.length === 0) {
    // create subscription
    let subscription = {
      user: userState.id,
      subscription: userState.subscription,
      phoneNumber: phoneNumber,
      payment_details,
      paymentRef: uuidv4(),
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


  //KOPOKOPO
  let amount = process.env.NODE_ENV === "development" ? 1 : userState.amount;
  let phone = phoneNumber;
  

  if (!userState.amount) return plans(ctx)

  let stk = await STK(
    amount,
    phone,
    ctx.from.first_name,
    user.id,
    subscriptionID
  );

  if (!stk) {
    return ctx.reply(
      "Payment initiation failed. Try again.",
      Markup.inlineKeyboard([
        Markup.button.callback("Retry payment", "retry_mpesa"),
      ])
    );
  }

  return ctx.reply(
    `Please enter your M-Pesa pin to pay KES: ${userState.amount}.`,
    Markup.inlineKeyboard([
      Markup.button.callback("Retry payment", "retry_mpesa"),
      Markup.button.callback("Check payment status", "payment_status"),
    ])
  );
};

// retry mpesa
const handleRetryMpesa = async (ctx) => {
  // get phone number from state
  let userState = setupUser(ctx); 

  let { phoneNumber, userId } = userState;
  let amount = userState.amount;

  // if no phoneNumber
  if (!phoneNumber) return plans(ctx);

  // check for an active subscription
  let confirm = await Subscription.findOne({
    user_id: userId,
    status: "active",
  });

  if (confirm) {
    ctx.reply("You have an active subscription.");
    return;
  }

  // get the pending subscription from db
  let subscription = await Subscription.findOne({
    user_id: userId,
    status: "pending",
  });

  // if no subscription is pending
  if (!subscription) {
    ctx.reply("You have no pending subscription. \n Select a plan to start.");
    return plans(ctx);
  }

  // if subscription present
  let subscriptionID = subscription.id;

  //KOPOKOPO
  amount = process.env.NODE_ENV === "development" ? 1 : userState.amount;
  let phone = phoneNumber;

  let stk = await STK(
    amount,
    phone,
    ctx.from.first_name,
    subscription.user,
    subscriptionID
  );

  if (!stk) {
    return ctx.reply(
      "Payment initiation failed. Try again.",
      Markup.inlineKeyboard([
        Markup.button.callback("Retry payment", "retry_mpesa"),
      ])
    );
  }

  return ctx.reply(
    `Please enter your M-Pesa pin to pay KES: ${amount}.`,
    Markup.inlineKeyboard([
      Markup.button.callback("Retry payment", "retry_mpesa"),
      Markup.button.callback("Check payment status", "payment_status"),
    ])
  );
};

const handleConfirm = async (ctx) => {
  // get user
  let userState = setupUser(ctx); 
  let user = await User.findOne({ user_id: userState.userId });

  if (!user) {
    ctx.reply("Select a plan to begin.");
    return plans(ctx);
  }

  // get and active subscription
  let subscription = await Subscription.findOne({
    user: user.id,
    status: "active",
  });
  if (!subscription) {
    ctx.reply("You have no active subscription.");
    return plans(ctx);
  }

  // check if user is member
  let confirm = await botInstance.bot.telegram.getChatMember(
    process.env.CHANNEL_ID,
    user.user_id
  );

  if (["creator", "administrator", "member"].includes(confirm.status)) {
    ctx.reply("You are already added to the channel");
  } else {
    ctx.reply(
      `Remember you should have a request to join the channel through the link: \n ${process.env.INVITE_LINK}`
    );
    await botInstance.addUserToChannel(user.user_id, process.env.CHANNEL_ID);
  }
};

// check mpesa statement
const handleCheckMpesaStatus = async (ctx) => {
  // get user
  let userState = setupUser(ctx); 
  let user = await User.findOne({ user_id: userState.userId });

  if (user) {
    // check user subscriptions and get most recent one
    let subscriptions = await Subscription.find({ user: user.id })
      .sort({ createdAt: -1 })
      .limit(1);
    if (subscriptions.length === 0) {
      ctx.reply("You have no pending subscription");
      plans(ctx);
      return;
    }
    let status = subscriptions[0].status;

    let message =
      status === "pending"
        ? "Payment is still pending."
        : status === "active"
        ? ""
        : `Payment failed - ${
            subscriptions[0].payment_details.ResultDec || ""
          }`;
    if (status === "active") {
      await botInstance.addUserToChannel(user.user_id, process.env.CHANNEL_ID);
    }
    ctx.reply(message);
  }
};

module.exports = {
  handleCheckMpesaStatus,
  handlePaymentPrompt,
  handleRetryMpesa,
  handleSubscription,
  // handleConfirm
};
