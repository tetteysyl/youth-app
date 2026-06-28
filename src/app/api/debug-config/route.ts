import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? "SET" : "MISSING",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "MISSING",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "MISSING",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? "SET" : "MISSING",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "MISSING",
  });
}
