import nodemailer from "nodemailer";

const GMAIL_USER = "pcg.saviour@gmail.com";
const GMAIL_PASS = "hypsrgjcksyceiwq";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS,
  },
});

export async function sendAbsenceInquiry(
  memberEmail: string,
  memberName: string,
  meetingTitle: string,
  meetingDate: string
) {
  await transporter.sendMail({
    from: `"YPG - PCG Saviour" <${GMAIL_USER}>`,
    to: memberEmail,
    subject: `Absence Notice — ${meetingTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a3a5c; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">YPG — Presbyterian Church of Ghana</h1>
          <p style="color: #a0c4ff; margin: 5px 0 0;">Young People's Guild</p>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Dear <strong>${memberName}</strong>,</p>
          <p>We noticed you were absent from our meeting:</p>
          <div style="background: white; border-left: 4px solid #1a3a5c; padding: 15px; margin: 20px 0;">
            <strong>${meetingTitle}</strong><br/>
            <span style="color: #666;">Date: ${meetingDate}</span>
          </div>
          <p>We hope all is well. Please reply to this email or reach out to your organizer to let us know the reason for your absence.</p>
          <p>We look forward to seeing you at our next meeting.</p>
          <p>Yours in Service,<br/><strong>YPG Secretariat</strong><br/>Presbyterian Church of Ghana — Saviour Congregation</p>
        </div>
        <div style="background: #1a3a5c; padding: 10px; text-align: center;">
          <p style="color: #a0c4ff; margin: 0; font-size: 12px;">This is an automated message from the YPG Management System</p>
        </div>
      </div>
    `,
  });
}

export async function sendWelcomeEmail(memberEmail: string, memberName: string) {
  await transporter.sendMail({
    from: `"YPG - PCG Saviour" <${GMAIL_USER}>`,
    to: memberEmail,
    subject: "Welcome to YPG — Your Account Has Been Approved",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a3a5c; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">YPG — Presbyterian Church of Ghana</h1>
          <p style="color: #a0c4ff; margin: 5px 0 0;">Young People's Guild</p>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Dear <strong>${memberName}</strong>,</p>
          <p>Welcome to the YPG family! Your account has been approved and you can now log in to the YPG Management App.</p>
          <p>Through the app you can:</p>
          <ul>
            <li>View upcoming meetings and events</li>
            <li>Receive attendance notifications</li>
            <li>Stay up to date with guild activities</li>
          </ul>
          <p>God bless you as you serve in this guild.</p>
          <p>Yours in Service,<br/><strong>YPG Secretariat</strong></p>
        </div>
      </div>
    `,
  });
}

export async function sendBirthdayEmail(memberEmail: string, memberName: string) {
  await transporter.sendMail({
    from: `"YPG - PCG Saviour" <${GMAIL_USER}>`,
    to: memberEmail,
    subject: `🎉 Happy Birthday, ${memberName.split(" ")[0]}!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b1f6e, #2a1550); padding: 24px; text-align: center;">
          <h1 style="color: #f0c940; margin: 0;">🎂 Happy Birthday!</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Dear <strong>${memberName}</strong>,</p>
          <p>The entire YPG family at Presbyterian Church of Ghana — Saviour Congregation, Madina-West wishes you a very happy birthday!</p>
          <p>May this new year of your life be filled with God's grace, good health, and abundant blessings as you continue to know His will and do it.</p>
          <p style="margin-top: 20px; font-style: italic; color: #666;">"To Know His Will and To Do It"</p>
          <p>With love,<br/><strong>YPG Executives</strong></p>
        </div>
      </div>
    `,
  });
}

export async function sendYafTransitionEmail(memberEmail: string, memberName: string) {
  await transporter.sendMail({
    from: `"YPG - PCG Saviour" <${GMAIL_USER}>`,
    to: memberEmail,
    subject: `Congratulations, ${memberName.split(" ")[0]}! You're now a YAF member 🎉`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b1f6e, #2a1550); padding: 24px; text-align: center;">
          <h1 style="color: #f0c940; margin: 0;">Congratulations!</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Dear <strong>${memberName}</strong>,</p>
          <p>Congratulations on turning 30 and becoming a <strong>Young Adult Fellowship (YAF)</strong> member! Thank you for being a faithful member of the Young People's Guild for these past years.</p>
          <p>We deeply appreciate all the contributions, energy, and love you have brought to the Guild. As you transition into YAF, please know that you will always be part of our family in Christ.</p>
          <p>We pray God's continued blessings over the next chapter of your life and ministry.</p>
          <p style="margin-top: 20px; font-style: italic; color: #666;">"To Know His Will and To Do It"</p>
          <p>With gratitude,<br/><strong>YPG Executives</strong></p>
        </div>
      </div>
    `,
  });
}

export async function sendYafRemovalWarningEmail(memberEmail: string, memberName: string, removalDate: string) {
  await transporter.sendMail({
    from: `"YPG - PCG Saviour" <${GMAIL_USER}>`,
    to: memberEmail,
    subject: `Your YPG account will close on ${removalDate}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #b45309; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Account Closing Soon</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>Dear <strong>${memberName}</strong>,</p>
          <p>This is a friendly reminder that as a YAF (Young Adult Fellowship) member, your YPG account is scheduled to be automatically closed in <strong>3 days</strong>, on <strong>${removalDate}</strong>.</p>
          <p>If you believe this is a mistake, please reach out to the YPG executives as soon as possible.</p>
          <p>Thank you once again for your years of dedicated service and contribution to the Guild. We pray God's blessings over your continued walk with Him.</p>
          <p style="margin-top: 20px; font-style: italic; color: #666;">"To Know His Will and To Do It"</p>
          <p>With gratitude,<br/><strong>YPG Executives</strong></p>
        </div>
      </div>
    `,
  });
}

export async function sendBroadcastEmail(
  recipients: { email: string; name: string }[],
  subject: string,
  message: string,
  senderName: string
) {
  const emails = recipients.map((r) => r.email).join(",");
  await transporter.sendMail({
    from: `"YPG - PCG Saviour" <${GMAIL_USER}>`,
    bcc: emails,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a3a5c; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">YPG — Presbyterian Church of Ghana</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
          <p>${message.replace(/\n/g, "<br/>")}</p>
          <p>— <strong>${senderName}</strong></p>
        </div>
      </div>
    `,
  });
}
