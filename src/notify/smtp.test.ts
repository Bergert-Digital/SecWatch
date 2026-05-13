import { describe, it, expect, vi } from "vitest";
import { createSmtpSender } from "./smtp.js";

describe("createSmtpSender", () => {
  it("calls nodemailer transport.sendMail with the rendered email + From header", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "x" }));
    const transport = { sendMail } as never;
    const send = createSmtpSender({
      transport,
      fromAddress: "from@example.com",
      fromName: "SecWatch",
    });
    await send({ to: "to@example.com", subject: "S", text: "t", html: "<p>h</p>" });
    expect(sendMail).toHaveBeenCalledWith({
      from: '"SecWatch" <from@example.com>',
      to: "to@example.com",
      subject: "S",
      text: "t",
      html: "<p>h</p>",
    });
  });

  it("propagates send errors", async () => {
    const sendMail = vi.fn(async () => {
      throw new Error("auth fail");
    });
    const transport = { sendMail } as never;
    const send = createSmtpSender({ transport, fromAddress: "f@x", fromName: "S" });
    await expect(send({ to: "t@x", subject: "", text: "", html: "" })).rejects.toThrow(
      "auth fail",
    );
  });
});
