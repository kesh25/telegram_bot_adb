// handles delivering sms 

const credentials = {
    apiKey: process.env.AFRICA_TALKING_API,          
    username: process.env.AFRICA_TALKING_USERNAME,     
};
const AfricasTalking = require('africastalking')(credentials);

// const sms = AfricasTalking.SMS

class SMS {
    constructor(to, message) {
        this.options = {
            to, 
            message
        }
        // Initialize a service e.g. SMS
        this.sms = AfricasTalking.SMS; 
    }

    async send() {
        try {
            this.sms.send(this.options); 
            console.log("SMS sent")
        } catch (err) {
            console.log(err)
        }
    }
}; 

module.exports = SMS; 