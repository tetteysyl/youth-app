import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import nodemailer from "nodemailer";

export async function GET() {
  const results: Record<string, any> = {};

  // 1. Check env vars
  results.env = {
    FIREBASE_ADMIN_PRIVATE_KEY: process.env.FIREBASE_ADMIN_PRIVATE_KEY
      ? `SET (length: ${process.env.FIREBASE_ADMIN_PRIVATE_KEY.length})`
      : "MISSING",
    GMAIL_USER: process.env.GMAIL_USER || "MISSING",
    GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD
      ? `SET (length: ${process.env.GMAIL_APP_PASSWORD.length})`
      : "MISSING",
  };

  // 2. Test Admin SDK — try to read one member
  try {
    const snap = await adminDb.collection("members").limit(1).get();
    results.adminSdk = { ok: true, docsFound: snap.size };
  } catch (e: any) {
    results.adminSdk = { ok: false, error: e.message };
  }

  // 3. Test email SMTP connection
  try {
    const GMAIL_USER = process.env.GMAIL_USER || "pcg.saviour@gmail.com";
    const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || "ybfhnravtxxzqaxd";
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });
    await transporter.verify();
    results.smtp = { ok: true, user: GMAIL_USER };
  } catch (e: any) {
    results.smtp = { ok: false, error: e.message };
  }

  // 4. Try sending a real test email
  try {
    const GMAIL_USER = process.env.GMAIL_USER || "pcg.saviour@gmail.com";
    const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || "ybfhnravtxxzqaxd";
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"YPG Test" <${GMAIL_USER}>`,
      to: "stettey122@gmail.com",
      subject: "YPG Test Email",
      text: "This is a test email from the YPG app diagnostic endpoint.",
    });
    results.testEmail = { ok: true, sentTo: "stettey122@gmail.com" };
  } catch (e: any) {
    results.testEmail = { ok: false, error: e.message };
  }

  return NextResponse.json(results, { status: 200 });
}
