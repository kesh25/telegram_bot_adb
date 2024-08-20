// telegramBot.js
const { Telegraf } = require("telegraf");
const token = process.env.TELEGRAM_TOKEN;
class TelegramBot {
  constructor() {
    this.bot = new Telegraf(token);
    this.channelId = process.env.CHANNEL_ID; 
    this.premium = process.env.PREMIUM_CHANNEL_ID; 

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

  // clean up unsent messages - TO DO
  // async cleanupUnsentMessages() {
  //   try {
  //     const pendingMessages = await this.bot.getMyCommands();
  //     console.log(pendingMessages)
  //   } catch(err) {
  //     console.log("ERROR GETTING UNSENT MESSAGES ->", err)
  //   }
  // }
  async verifyJoin (userId, premium) {
    try {
      let channel = premium ? this.premium: this.channelId; 
      let check = await this.bot.telegram.getChatMember(channel, userId);
  
       if (!["member", "administrator", "creator"].includes(check.status)) {
          return false; 
       } else return true; 

    } catch (err) {console.log(err)}
  }
  async addUserToChannel(userId, premium) {
    try {

        // check if in group 
        let checkIfUserInChannel = await this.verifyJoin(userId, premium); 
        if (!checkIfUserInChannel) {
            let channel = premium ? this.premium: this.channelId; 

            // unban user to remove the link expired error
            await this.bot.telegram.unbanChatMember(channel, userId); 
            await this.bot.telegram.approveChatJoinRequest(channel, userId)
        }
        return true; 
       
    } catch (error) {
         
        console.error("Error adding user to channel:", error);
        return false; 
    }
  }

  async removeUserFromChannel(userId, premium) {
    try {
        let channelId = premium ? this.premium: this.channelId;
        let channelName = premium ? process.env.PREMIUM_CHANNEL_NAME: process.env.CHANNEL_NAME; 
      // ban the user which kicks them out
      // then unban them immediately in case they join again
      // and to remove the link expired error
      await this.bot.telegram.kickChatMember(channelId, userId);
      await this.bot.telegram.unbanChatMember(channelId, userId); 

      await this.bot.telegram.sendMessage(userId, `Your subscription for ${channelName} has ended.`)
    } catch (error) {
      console.error("Error removing user from channel:", error);
    }
  }
}

const botInstance = TelegramBot.getInstance();

module.exports = botInstance;
