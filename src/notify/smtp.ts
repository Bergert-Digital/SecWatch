import nodemailer, { type Transporter } from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromAddress: string;
  fromName: string;
}

export interface SendArgs {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type Sender = (args: SendArgs) => Promise<void>;

export function createSmtpTransport(cfg: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

interface FactoryArgs {
  transport: Transporter;
  fromAddress: string;
  fromName: string;
}

export function createSmtpSender({ transport, fromAddress, fromName }: FactoryArgs): Sender {
  const from = `"${fromName}" <${fromAddress}>`;
  return async ({ to, subject, text, html }) => {
    await transport.sendMail({ from, to, subject, text, html });
  };
}
