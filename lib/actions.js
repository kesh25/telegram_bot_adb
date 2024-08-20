// bot actions
const { Markup } = require("telegraf");
const { v4: uuidv4 } = require("uuid");

const { initiatePhoneNumberInput, validatePhone, STK, setupUser, updateUsersCache } = require("./utils");
const { plans } = require("./utils");

//models
const User = require("../models/userModel");
const Subscription = require("../models/subscriptionModel");
 

const botInstance = require("./bot");

// handle subscription handlers
const handleSubscription = (ctx, type, amount) => {
  ctx.answerCbQuery(`Subscribing to ${type} plan.`);
  initiatePhoneNumberInput(ctx, amount, type);

  // update users cache...
  let user = setupUser(ctx); 
  user.subscription = type; 
  user.amount = Number(amount); 

  updateUsersCache(ctx.from.id, null, null, Number(amount), type)

};

// payment prompt
const handlePaymentPrompt = async (type, ctx) => {
  let userState = setupUser(ctx); 

  const userId = userState.userId; 

  // ctx.from.id;
  let phoneNumber =
    type === "text" ? ctx.message.text : ctx.message.contact.phone_number;

  if (type === "contact" && phoneNumber.startsWith("+")) phoneNumber = phoneNumber.slice(1);
  // validate phone number if is safaricom
  // validatePhone
  if (!validatePhone(phoneNumber)) {
    return ctx.reply(
      "Invalid command. If you are entering a phone number, user (07** *** *** or 2547** *** ***) format. Else use either of these commands \n /start \n /confirm \n /subscribe"
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
  } else {
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
  let subscription = await Subscription.findOne({
    user: user.id,
    status: "pending",
  });

  // to hold the subscription ID;
  let subscriptionID;
  let payment_details = {
    amount: userState.amount,
    mpesa_no: phoneNumber,
  };
  if (!subscription) {
    // create subscription
    let doc = {
      user: userState.id,
      subscription: userState.subscription,
      phoneNumber: phoneNumber,
      payment_details,
      paymentRef: uuidv4(),
      premium: userState.subscription === "premium"
    };

    subscription = await Subscription.create(doc);
    subscriptionID = subscription.id;
  } else {
    // if user has a pending subscription
    // update that subscription
    subscriptionID = subscription.id;
    await Subscription.findByIdAndUpdate(subscription.id, {
      subscription: userState.subscription,
      phoneNumber,
      payment_details,
    });
  }


  //KOPOKOPO
  let amount = process.env.NODE_ENV === "development" ? 1 : userState.amount;
  let phone = phoneNumber;
  

  if (!userState.amount || !userState.subscription) return plans(ctx)

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
    `Please enter your Mpesa pin to authorize KES: ${amount} for the ${userState.subscription} subscription service`,
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
    `Please enter your Mpesa pin to authorize KES: ${amount} for the ${userState.subscription} subscription service`,
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
    let premium = userState.subscription === "premium"; 

    let checkIfUserInChannel = await botInstance.verifyJoin(userState.userId, premium);
    if (checkIfUserInChannel) await botInstance.removeUserFromChannel(userState.userId, premium)
    ctx.reply("You have no active subscription.");
    return plans(ctx);
  }

  // check if user is member
  let confirm = await botInstance.verifyJoin(user.user_id, premium);

  if (confirm) {
    ctx.reply("You are already added to the channel");
  } else {
    let link = premium ? process.env.PREMIUM_CHANNEL_INVITE_LINK: process.env.INVITE_LINK; 
    ctx.reply(
      `Remember you should first request to join the channel through the link: \n ${link}, then select on Verify membership below`,
      Markup.inlineKeyboard([
        Markup.button.callback("Verify membership", "verify_join")
      ])
    );
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
            subscriptions[0].payment_details.errors || ""
          }`;
    if (status === "active") {
      await botInstance.addUserToChannel(user.user_id, userState.subscription === "premium");
    }
    ctx.reply(message);
  }
};

// verify join 
const handleVerifyJoin = async ctx => {
   
  let user_id = ctx.from.id; 
  // check if user is registered
  let user = await User.findOne({user_id}); 
  if (!user) {
    ctx.reply("Select a plan to proceed."); 
    return plans(ctx)
  }


  // check for active subscriptions 
  let subscription = await Subscription.findOne({user: user.id, status: "active"}); 


  // check if user has already been added
  let checkIfUserInChannel = await botInstance.verifyJoin(user_id, subscription.premium); 
  console.log(checkIfUserInChannel)
  if (checkIfUserInChannel) return ctx.reply("You are already a member of the channel.")



  if (!subscription) {
    ctx.reply("You have no active subscription."); 
    return plans(ctx)
  }
  // if user has an active subscription - add to group 
  let add = await botInstance.addUserToChannel(user_id, subscription.premium); 

  if (add) {
    return ctx.reply("You were added to the channel")
  } else {
    let link = subscription.premium ? process.env.PREMIUM_CHANNEL_INVITE_LINK: process.env.INVITE_LINK;
    return ctx.reply(`Click on the invite link -> ${link} first before tapping the verify membership button.`,
      Markup.inlineKeyboard([
        Markup.button.callback("Verify membership", "verify_join")
      ])
    )
  }
}

module.exports = {
  handleCheckMpesaStatus,
  handlePaymentPrompt,
  handleRetryMpesa,
  handleSubscription,
  handleVerifyJoin,
  handleConfirm
};
