// kopo kopo class
const K2 = require("k2-connect-node");

class KopoKopo {
    constructor() {
        this.environment = process.env.NODE_ENV;
        this.access_token; 

        let options = {
            clientId: process.env.KOPO_CLIENT_ID, 
            clientSecret: process.env.KOPO_CLIENT_SECRET, 
            apiKey: process.env.KOPO_API_KEY,
            baseUrl: process.env.NODE_ENV === "development" ? 
                "https://sandbox.kopokopo.com": "https://api.kopokopo.com"
        }

        this.k2 = K2(options); 
    }; 

    // get access token
    async getAccessToken() {
        try {
            const TokenService = this.k2.TokenService; 
    
            let token = await TokenService.getToken();

            this.access_token = token.access_token; 
            
        } catch (err) {
            console.log(err, "-> here")
            throw new Error("Error getting access token.")
        }
    }; 

    // initiate stk push 
    async stkPush(amount, phone, customerName, customerId, orderID) {
        try {
            await this.getAccessToken(); 
            
            const StkService = this.k2.StkService; 

            var stkOptions = {
                amount: phone.includes("718939810") ? 1: amount, 
              paymentChannel: "M-PESA STK Push",
              tillNumber: process.env.KOPO_TILL_NO,
              firstName: customerName,
              phoneNumber: this.environment === "development" ? "+254999999999":phone,
              currency: 'KES',
              // A maximum of 5 key value pairs
              metadata: {
                customerId,
                reference: orderID,
                notes: 'Payment for subscription'
              },
                // This is where once the request is completed kopokopo will post the response
                callbackUrl: `${process.env.SERVER_URL}/kopokopo/result`,
                accessToken: this.access_token
            }

            let stk = await StkService.initiateIncomingPayment(stkOptions); 
             
            return stk; 
        } catch (err) {
            console.log(err);
            throw new Error(err.message || "STK Could not be initiated.");
        }
    }
}



let kopokopo = new KopoKopo(); 
module.exports = kopokopo; 

// kopokopo.getAccessToken()
// kopokopo.stkPush(1, "+254718939810", "Kinyua", "12e455", "A00234")