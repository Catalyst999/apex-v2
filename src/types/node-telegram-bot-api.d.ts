declare module 'node-telegram-bot-api' {
  class TelegramBot {
    constructor(token: string, options?: any);
    onText(regexp: RegExp, callback: (msg: any, match: any) => void): void;
    sendMessage(chatId: string | number, text: string, options?: any): Promise<any>;
    answerCallbackQuery(callbackQueryId: string, options?: any): Promise<any>;
    [key: string]: any;
  }

  export = TelegramBot;
}
