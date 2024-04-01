const express = require("express"); 
const MPESA = require("./lib/mpesa");
const SMS = require("./lib/sms"); 

const Subscription = require("./models/subscriptionModel");
const User = require("./models/userModel"); 

const botInstance = require("./lib/bot"); 

const router = express.Router(); 

// test 
router.get("/", async (req, res) => {
    res.send("Hello World!");
}); 

// receive mpesa result; 
router.post("/mpesa/result", async (req, res) => {
    try {
        let body = req.body.Body.stkCallback; 
    
        // initiate mpesa 
        let mpesa = new MPESA(); 
        let result = mpesa.parseSTKResults(body); 

        // fetch subscription based on paymentRef
        let status = result.status === "success" ? "active": "failed"; 

        let subscription = await Subscription.findOne({paymentRef: result.CheckoutRequestID, status: "pending"}); 

        if (!subscription) return res.status(400).json({status: "fail"}); 
        // get user 
        let user = await User.findById(subscription.user); 
        if (!user) return res.status(400).json({status: "fail"});

        let type = subscription.subscription; 
        let commence_at;
        let expires_at;


        // bot instance
        let bot = botInstance.getBot(); 

        if (status === "active") {
            // Get the current date
            commence_at = new Date();
    
            // Add 7 weeks to the current date
            var sevenWeeksLater = new Date(commence_at.getTime() + (7 * 7 * 24 * 60 * 60 * 1000));
    
            // Add a month to the current date
            var oneMonthLater = new Date(commence_at);
            oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
    
            // Add an year to the current date
            var oneYearLater = new Date(commence_at);
            oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    
            // Convert dates to MongoDB ISODate format
            var sevenWeeksLaterISODate = sevenWeeksLater.toISOString();
            var oneMonthLaterISODate = oneMonthLater.toISOString();
            var oneYearLaterISODate = oneYearLater.toISOString();
    
            expires_at = type === "weekly" ? sevenWeeksLaterISODate: type === "monthly" ? oneMonthLaterISODate: oneYearLaterISODate; 
        
            // add user to group
            await botInstance.addUserToChannel(user.user_id, process.env.CHANNEL_ID)
            
            let owner_phone = process.env.OWNER_PHONE; 
            let sms = new SMS([owner_phone], `A new user has paid for the ${type} subscription.`);
            await sms.send(); 
        } else {
            botInstance.getBot().telegram.sendMessage(user.user_id, "Payment was unsuccessful.")
        }
        await Subscription.findByIdAndUpdate(subscription.id, {status, payment_details: {...subscription.payment_details, ...result}, expires_at, commence_at}); 
    
        // send member this message 
        let message = result.status === "success" ? `Payment was successful for the ${type} subscription ending on ${format(expires_at, "MMM dd, yyyy")}`: `Payment was unsuccessful because ${result.ResultDesc.toLowerCase()}`; 
        console.log(message);
        await bot.telegram.sendMessage(user.user_id, message); 
        
        res.status(200).json({status: "success"})
    } catch (err) {
        console.log(err)
        res.status(400).json({status: "fail"})
    }
})

module.exports = router; 