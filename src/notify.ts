import { WebClient } from "@slack/web-api";

export class Slack {
  client: WebClient;
  channel: string;

  constructor(token: string, channel: string) {
    this.client = new WebClient(token);
    this.channel = channel;
  }

  static async fromEnv(): Promise<Slack> {
    const { SLACK_TOKEN, SLACK_CHANNEL } = process.env;
    const slack = new Slack(SLACK_TOKEN!, SLACK_CHANNEL!);
    // Test early!
    const result = await slack.client.auth.test();
    if (result.ok) {
      return slack;
    } else {
      throw new Error(`couldn't connect to slack: ${result.error}`);
    }
  }

  async post(message: string): Promise<void> {
    let result = await this.client.chat.postMessage({
      text: message,
      channel: this.channel,
    });
    if (result.ok) {
      return;
    } else {
      throw new Error(`failed to post: ${result.error}`);
    }
  }
}
