import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBL0SLKyTDV3dmP6nTw2C_CFjQZ9eCoKkw",
  authDomain: "ypg-pcg.firebaseapp.com",
  projectId: "ypg-pcg",
  storageBucket: "ypg-pcg.firebasestorage.app",
  messagingSenderId: "955299919721",
  appId: "1:955299919721:web:d3b83ec31dfcd15033eff8",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
// Keep the user signed in across browser restarts until they explicitly sign out
setPersistence(auth, browserLocalPersistence).catch(() => {});
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const getMessagingInstance = async () => {
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
};
