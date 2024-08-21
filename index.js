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
  handleVerifyJoin,
  handleConfirm
} = require("./lib/actions");
const { basicPlans, plans, setupUser, updateUsersCache } = require("./lib/utils");
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
try {

  serverThroughDB(server, PORT);

} catch (err) {

}

// BOT LOGIC STARTS HERE

// Initialize bot
const bot = botInstance.getBot();
// new Telegraf(token);

// state variables
// const userState = cache.getItem("user_state"); 

// {};

// Start command handler
try {
  bot.start(async (ctx) => {
    try {
      let userState = setupUser(ctx)
      let user_id = userState.userId;
    
      // fetch user from db
      let user = await User.findOne({ user_id });
      // if not subscribed - show plans
    
      // if subscribed - proceed to authorization
      // Check if the user is starting the bot for the first time
      if (!user) {
        // "The bot collects subscription payments for Andy'S Beauty Spot Tutorials";
        plans(ctx);
        // Update the user's subscription status to indicate they have seen the preview message
        // subscriptions[ctx.from.id] = { previewSeen: true };
      } else {
        
        updateUsersCache(ctx.from.id, user.id)
    
        // check whether user has a subscription or not
        let subscriptions = await Subscription.find({
          user,
          status: "active",
        });
    
        // if user has no active subscriptions
        if (subscriptions.length === 0) return plans(ctx);
        else ctx.reply("Welcome back! You subscription is still active.");
      }
  
    } catch (err) {
      console.log(err, "here")
    }
  });

} catch (err) {
  console.log(err)
}


// plan selection 
bot.action("premium", ctx => handleSubscription(ctx, "premium", 1500)); 
bot.action("basic", ctx => basicPlans(ctx))
// // Subscribe option handlers
bot.action("subscribe_weekly", (ctx) =>
  handleSubscription(ctx, "weekly", 70)
);
bot.action("subscribe_monthly", (ctx) =>
  handleSubscription(ctx, "monthly", 200)
);
bot.action("subscribe_annually", (ctx) =>
  handleSubscription(ctx, "annual", 1200)
);

bot.action("verify_join", async ctx => handleVerifyJoin(ctx))

// subscribe option handler
bot.hears("Change plan", (ctx) => plans(ctx));
bot.hears("/subscribe", ctx => plans(ctx));
bot.hears("/confirm", ctx => handleConfirm(ctx))
bot.hears("/exit", async (ctx) => {
  let userId = ctx.from.id; 

  let user = await User.findOne({user_id: userId}); 

  if (user) {
    let subscription = await Subscription.findOne({user: user.id, status: "active"}); 

    if (subscription) {
      await  Subscription.findByIdAndUpdate(subscription.id, {status: "ended"}); 

    } else return; 
  } else return;
  await botInstance.removeUserFromChannel(userId);
 
})

// retry mpesa
bot.action("retry_mpesa", (ctx) => handleRetryMpesa(ctx));

// check payment status
bot.action("payment_status", (ctx) => handleCheckMpesaStatus(ctx));

// Handle phone number input
bot.on("text", (ctx) => handlePaymentPrompt("text", ctx));
bot.on("contact", (ctx) => handlePaymentPrompt("contact", ctx));

async function checkExpiredSubscriptions() {
  try {
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
      await botInstance.removeUserFromChannel(userId, curr.premium);
    }
    console.log("Done")
  } catch (err) {
    console.log(err)
  }
}

async function checkPendingSubscriptions() {
  try {
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

    console.log("Done...")
  } catch (err) {
    console.log(err)
  }
};



// Run checkExpiredSubscriptions function every 10 minutes
setInterval(checkExpiredSubscriptions, 30 * 60 * 1000);

// run checkPendingSubscriptions function every 30 minutes
setInterval(checkPendingSubscriptions, 30 * 60 * 1000);

// Start bot
try {
   
    bot.launch().then(() => console.log("Bot started")).catch(err => {console.log(err)});
} catch (err) {}
