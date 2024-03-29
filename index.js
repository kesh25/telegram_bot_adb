require("dotenv").config();
const express = require("express");
var http = require("http");
const { Telegraf } = require("telegraf");

const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const compression = require("compression");

const serverThroughDB = require("./lib/db");

const {
  handleCheckMpesaStatus,
  handlePaymentPrompt,
  handleRetryMpesa,
  handleSubscription,
} = require("./lib/actions");
const { plans } = require("./lib/utils");

// models
const User = require("./models/userModel");
const Subscription = require("./models/subscriptionModel");

// slight hack to keep bot alive - make it a http server
// to also handle the payment webhooks
// initiate express
const app = express();

// security
app.use(helmet());
app.use(cors());
app.use(compression());

app.use(logger("dev"));

const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: "Too many requests from this IP, please try again in an hour",
});

app.use("/", limiter);

app.use(express.json({ limit: "50mb" }));
// app.use(express.bodyParser({limit: '50mb'}));
app.use(
  express.urlencoded({
    extended: true,
  })
);
// body parser
app.use(cookieParser());
// nosql query injection prevention
app.use(mongoSanitize());

// data xss protection
app.use(xss());

// routes
const botRouter = require("./routes");

app.use("/", botRouter);

// error handler
app.all("*", (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

const PORT = 4040;

/**
 * Create HTTP server.
 */
var server = http.createServer(app);

// connect db
serverThroughDB(server, PORT);

// app.get("/", (req, res) => {
// 	res.send("Hello World!");
// });

// endpoint to receive mpesa payment
// app.post("/mpesa/result", async (req, res) => {

// })

// app.listen(PORT, () => {
// 	console.log(`Server running on port ${PORT}`);
// });

// BOT LOGIC STARTS HERE

// Telegram Bot Token
const token = process.env.TELEGRAM_TOKEN;

// Initialize bot
const bot = new Telegraf(token);

// Dictionary to store subscription details - db options
const subscriptions = {};

// state variables
const userState = {};

// Start command handler
bot.start(async (ctx) => {
  let user_id = ctx.from.id;

  // console.log(ctx.from);
  // fetch user from db
  let user = await User.findOne({ user_id });
  console.log(user);
  // if not subscribed - show plans

  // if subscribed - proceed to authorization
  // Check if the user is starting the bot for the first time
  if (!user) {
    // "The bot collects subscription payments for Andy'S Beauty Spot Tutorials";
    plans(ctx, userState);
    // Update the user's subscription status to indicate they have seen the preview message
    // subscriptions[ctx.from.id] = { previewSeen: true };
  } else {
    userState.registered = true; // handles if user is registered
    userState.id = user.id;
    // check whether user has a subscription or not
    let subscriptions = await Subscription.find({
      user,
      status: "active",
    });

    // if user has no active subscriptions
    if (subscriptions.length === 0) return plans(ctx, userState);
    else ctx.reply("Welcome back! You subscription is still.");

    // get the user details
    userState.userId = ctx.from.id;
    userState.first_name = ctx.from.first_name || ctx.from.username;
  }
});

// // Subscribe option handlers
bot.action("subscribe_weekly", (ctx) =>
  handleSubscription(ctx, "weekly", 70, userState)
);
bot.action("subscribe_monthly", (ctx) =>
  handleSubscription(ctx, "monthly", 200, userState)
);
bot.action("subscribe_annually", (ctx) =>
  handleSubscription(ctx, "annual", 1200, userState)
);

// subscribe option handler
bot.hears("Change plan", (ctx) => plans(ctx, userState));

// retry mpesa
bot.action("retry_mpesa", (ctx) => handleRetryMpesa(ctx, userState));

// check payment status
bot.action("payment_status", (ctx) => handleCheckMpesaStatus(ctx, userState));

// Handle phone number input
bot.on("text", (ctx) => handlePaymentPrompt("text", ctx, userState));
bot.on("contact", (ctx) => handlePaymentPrompt("contact", ctx, userState));

// Subscribe command handler
bot.command("subscribe", (ctx) => {
  const plan = ctx.message.text.split(" ")[0].toLowerCase();
  const userId = ctx.from.id;

  if (plan === "weekly" || plan === "monthly" || plan === "annually") {
    // Calculate subscription expiry date
    let expiryDate;
    if (plan === "weekly") {
      expiryDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    } else if (plan === "monthly") {
      expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else {
      expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }

    // Store subscription details
    subscriptions[userId] = { expiryDate };

    ctx.reply(`You have subscribed to the ${plan} plan.`);

    // Add user to the content access group/channel (replace 'GROUP_OR_CHANNEL_ID' with actual ID)
    ctx.telegram.sendMessage(
      "GROUP_OR_CHANNEL_ID",
      `New subscriber: ${ctx.from.username}`
    );
  } else {
    ctx.reply("Invalid plan. Please choose from weekly, monthly, or annually.");
  }
});

// Check subscriptions status and change all that have expired to ended
function checkExpiredSubscriptions() {
  console.log("checking subscriptions...");

  // find all subscriptions that are not expired and not pending

  const currentDate = new Date();

  // for (const [userId, subscription] of Object.entries(subscriptions)) {
  // 	if (currentDate > subscription.expiryDate) {
  // 		// Remove user from content access group/channel (replace 'GROUP_OR_CHANNEL_ID' with actual ID)
  // 		bot.telegram.sendMessage(
  // 			"GROUP_OR_CHANNEL_ID",
  // 			`Subscription expired: ${userId}`,
  // 		);
  // 		delete subscriptions[userId];
  // 	}
  // }
}

function checkPendingSubscriptions() {
  console.log("checking pending subscriptions...");
  const currentDate = new Date();
}

// Run checkExpiredSubscriptions function every 10 minutes
setInterval(checkExpiredSubscriptions, 1 * 60 * 1000);

// run checkPendingSubscriptions function every 30 minutes
setInterval(checkPendingSubscriptions, 1 * 60 * 1000);

// Start bot
bot.launch().then(() => console.log("Bot started"));
