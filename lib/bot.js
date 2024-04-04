// telegramBot.js
const { Telegraf } = require('telegraf');
const token = process.env.TELEGRAM_TOKEN;

class TelegramBot {
    constructor() {
        this.bot = new Telegraf(token);
    }

    static getInstance() {
        if (!this.instance) {
            this.instance = new TelegramBot();
        }
        return this.instance;
    }

    getBot() {
        return this.bot;
    }

    async addUserToChannel(userId, channelId) {
        try {
            // await this.bot.telegram.inviteChatMember(channelId, userId);
            let check = await this.bot.telegram.getChatMember(channelId, userId); 

            // get the status 
            // to expect - creator, administrator, member
            // restricted, left, kicked, left_chat_member
            // let status = check.status; 

            //  confirming necessary 
            if (!["member", "administrator", "creator"].includes(check.status) && !check.user.is_bot) {
                // slight hack, both unban and approve request
                await this.bot.telegram.unbanChatMember(channelId, userId)
                await this.bot.telegram.approveChatJoinRequest(channelId, userId)
            }
        
           
        } catch (error) {
            console.error('Error adding user to channel:', error);
        }
    }

    async removeUserFromChannel(userId, channelId) {
        try {
            // ban the user 
            // when re-subscribing, unban or approve request
            await this.bot.telegram.kickChatMember(channelId, userId);
        } catch (error) {
            console.error('Error removing user from channel:', error);
        }
    }
}
const botInstance = TelegramBot.getInstance();

module.exports = botInstance;
