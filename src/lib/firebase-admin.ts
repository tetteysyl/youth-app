import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

export function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0];
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  return initializeApp({
    credential: cert({
      projectId: "ypg-pcg",
      clientEmail: "firebase-adminsdk-fbsvc@ypg-pcg.iam.gserviceaccount.com",
      privateKey: privateKey?.replace(/\\n/g, "\n"),
    }),
    storageBucket: "ypg-pcg.firebasestorage.app",
  });
}

export const adminDb = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_, prop) {
    return (getFirestore(getAdminApp()) as any)[prop];
  },
});

export const adminAuth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_, prop) {
    return (getAuth(getAdminApp()) as any)[prop];
  },
});

export const adminMessaging = new Proxy({} as ReturnType<typeof getMessaging>, {
  get(_, prop) {
    return (getMessaging(getAdminApp()) as any)[prop];
  },
});
