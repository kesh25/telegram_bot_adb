// telegramBot.js
const { Telegraf } = require("telegraf");
const token = process.env.TELEGRAM_TOKEN;
class TelegramBot {
  constructor() {
    this.bot = new Telegraf(token);
    this.channelId = process.env.CHANNEL_ID; 
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

  async verifyJoin (userId) {
    try {
      let check = await this.bot.telegram.getChatMember(this.channelId, userId);
  
       if (!["member", "administrator", "creator"].includes(check.status)) {
          return false; 
       } else return true; 

    } catch (err) {console.log(err)}
  }
  async addUserToChannel(userId) {
    try {

        // check if in group 
        let checkIfUserInChannel = await this.verifyJoin(userId); 
        if (!checkIfUserInChannel) {
            // unban user to remove the link expired error
            await this.bot.telegram.unbanChatMember(this.channelId, userId); 
            await this.bot.telegram.approveChatJoinRequest(this.channelId, userId)
        }
        return true; 
       
    } catch (error) {
         
        console.error("Error adding user to channel:", error);
        return false; 
    }
  }

  async removeUserFromChannel(userId) {
    try {
        let channelId = this.channelId;
      // ban the user which kicks them out
      // then unban them immediately in case they join again
      // and to remove the link expired error
      await this.bot.telegram.kickChatMember(channelId, userId);
      await this.bot.telegram.unbanChatMember(channelId, userId); 

      await this.bot.telegram.sendMessage(userId, `Your subscription for ${process.env.CHANNEL_NAME} has ended.`)
    } catch (error) {
      console.error("Error removing user from channel:", error);
    }
  }
}

const botInstance = TelegramBot.getInstance();

module.exports = botInstance;
