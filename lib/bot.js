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
            await this.bot.telegram.inviteChatMember(channelId, userId);
            console.log('User added to channel successfully');
        } catch (error) {
            console.error('Error adding user to channel:', error);
        }
    }

    async removeUserFromChannel(userId, channelId) {
        try {
            await this.bot.telegram.kickChatMember(channelId, userId);
            await this.bot.telegram.unbanChatMember(channelId, userId)
            
            console.log('User removed from channel successfully');
        } catch (error) {
            console.error('Error removing user from channel:', error);
        }
    }
}
const botInstance = TelegramBot.getInstance();

module.exports = botInstance;
