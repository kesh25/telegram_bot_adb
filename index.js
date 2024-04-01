require("dotenv").config();
const express = require("express");
var http = require("http");
// const { Telegraf } = require("telegraf");

const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const compression = require("compression");

const serverThroughDB = require("./lib/db");
const AppError = require("./utils/appError");

const {
  handleCheckMpesaStatus,
  handlePaymentPrompt,
  handleRetryMpesa,
  handleSubscription,
} = require("./lib/actions");
const { plans } = require("./lib/utils");
const botInstance = require("./lib/bot");

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

app.set("trust proxy", "127.0.0.1");

// routes
const botRouter = require("./routes");

app.use("/", botRouter);

// error handler
app.all("*", (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

const PORT = 8000;

/**
 * Create HTTP server.
 */
var server = http.createServer(app);

// connect db
serverThroughDB(server, PORT);

// BOT LOGIC STARTS HERE

// Initialize bot
const bot = botInstance.getBot();
// new Telegraf(token);

// state variables
const userState = {};

// Start command handler
bot.start(async (ctx) => {
  let user_id = ctx.from.id;

  // fetch user from db
  let user = await User.findOne({ user_id });
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

async function checkExpiredSubscriptions() {
  console.log("checking subscriptions...");
  // find all subscriptions that are not expired and not pending
  const currentDate = new Date();

  let expiredSubscriptions = await Subscription.find({
    status: "active",
    expires_at: { $lte: currentDate },
  });

  for (let i = 0; i < expiredSubscriptions.length; i++) {
    let curr = expiredSubscriptions[i];
    // get user
    let user = await User.findById(curr.user);
    let userId = user.user_id;

    // update subscription to ended
    await Subscription.findByIdAndUpdate(curr.id, { status: "ended" });

    // send user a message
    bot.telegram.sendMessage(
      userId,
      `Your subscription to Andy's Beauty Spot has expired: type /subscribe to re-subscribe.`
    );

    // remove user from channel
    botInstance.removeUserFromChannel(userId, process.env.CHANNEL_ID);
  }
}

async function checkPendingSubscriptions() {
  console.log("checking pending subscriptions...");

  // Calculate the date 30 minutes ago
  const thirtyMinutesAgo = new Date();
  thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

  let pendingSubscriptions = await Subscription.find({
    status: "pending",
    createdAt: { $lt: thirtyMinutesAgo },
  });

  for (let i = 0; i < pendingSubscriptions.length; i++) {
    let curr = pendingSubscriptions[i];
    // update subscription to failed
    await Subscription.findByIdAndUpdate(curr.id, { status: "failed" });
  }
};



// Run checkExpiredSubscriptions function every 10 minutes
setInterval(checkExpiredSubscriptions, 30 * 60 * 1000);

// run checkPendingSubscriptions function every 30 minutes
setInterval(checkPendingSubscriptions, 30 * 60 * 1000);

// Start bot
try {
  bot.launch().then(() => console.log("Bot started"));
} catch (err) {}
