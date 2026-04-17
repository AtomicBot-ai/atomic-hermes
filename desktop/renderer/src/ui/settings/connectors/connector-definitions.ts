export type ConnectorId =
  | "telegram"
  | "discord"
  | "slack"
  | "signal"
  | "whatsapp"
  | "matrix"
  | "email"
  | "homeassistant"
  | "sms"
  | "dingtalk"
  | "feishu"
  | "mattermost"
  | "bluebubbles";

export type ConnectorDefinition = {
  id: ConnectorId;
  name: string;
  description: string;
  iconEmoji: string;
  svgIcon?: string;
  hasCustomModal: boolean;
};

export function resolveConnectorIconUrl(svgIcon: string | undefined): string | undefined {
  if (!svgIcon) return undefined;
  return new URL(
    `../../../../../assets/messangers/${svgIcon}`,
    import.meta.url,
  ).toString();
}

export const CONNECTORS: ConnectorDefinition[] = [
  {
    id: "telegram",
    name: "Telegram",
    description: "Connect a Telegram bot to receive and send messages",
    iconEmoji: "✈",
    svgIcon: "Telegram.svg",
    hasCustomModal: true,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Connect a Discord bot to interact with your server",
    iconEmoji: "🎮",
    svgIcon: "Discord.svg",
    hasCustomModal: true,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Connect a Slack workspace via Socket Mode",
    iconEmoji: "S",
    svgIcon: "Slack.svg",
    hasCustomModal: true,
  },
  {
    id: "signal",
    name: "Signal",
    description: "Connect Signal via signal-cli for private messaging",
    iconEmoji: "🔒",
    svgIcon: "Signal.svg",
    hasCustomModal: false,
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Connect WhatsApp via a Node.js bridge",
    iconEmoji: "💬",
    svgIcon: "WhatsApp.svg",
    hasCustomModal: false,
  },
  {
    id: "matrix",
    name: "Matrix",
    description: "Connect to a Matrix homeserver for decentralized messaging",
    iconEmoji: "[m]",
    svgIcon: "Matrix.svg",
    hasCustomModal: false,
  },
  {
    id: "email",
    name: "Email",
    description: "Connect email via IMAP/SMTP for email-based messaging",
    iconEmoji: "📧",
    svgIcon: "Email.svg",
    hasCustomModal: false,
  },
  {
    id: "homeassistant",
    name: "Home Assistant",
    description: "Connect to Home Assistant for smart home automation",
    iconEmoji: "🏠",
    svgIcon: "HomeAssistant.svg",
    hasCustomModal: false,
  },
  {
    id: "sms",
    name: "SMS (Twilio)",
    description: "Send and receive SMS via Twilio",
    iconEmoji: "📱",
    svgIcon: "twilio.svg",
    hasCustomModal: false,
  },
  {
    id: "dingtalk",
    name: "DingTalk",
    description: "Connect a DingTalk chatbot via Stream Mode",
    iconEmoji: "🔔",
    svgIcon: "DingTalk.svg",
    hasCustomModal: false,
  },
  {
    id: "feishu",
    name: "Feishu / Lark",
    description: "Connect a Feishu or Lark bot",
    iconEmoji: "🐦",
    svgIcon: "Feishu.svg",
    hasCustomModal: false,
  },
  {
    id: "mattermost",
    name: "Mattermost",
    description: "Connect to a Mattermost server",
    iconEmoji: "💬",
    svgIcon: "mattermost.svg",
    hasCustomModal: false,
  },
  {
    id: "bluebubbles",
    name: "BlueBubbles (iMessage)",
    description: "Connect iMessage via BlueBubbles on macOS",
    iconEmoji: "💭",
    svgIcon: "iMessage.svg",
    hasCustomModal: false,
  },
];
