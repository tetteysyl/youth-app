import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use the downloaded service account JSON
const serviceAccount = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../Downloads/ypg-pcg-firebase-adminsdk-fbsvc-27cc20014b.json"),
    "utf8"
  )
);

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth(app);
const db = getFirestore(app);

const PRESIDENT_EMAIL = "stettey121@gmail.com";
const PRESIDENT_PASSWORD = "AsT@2025";
const PRESIDENT_NAME = "Sly";
const PRESIDENT_PHONE = "";

async function main() {
  console.log("Creating President account...");

  let uid;

  try {
    const user = await auth.createUser({
      email: PRESIDENT_EMAIL,
      password: PRESIDENT_PASSWORD,
      displayName: PRESIDENT_NAME,
    });
    uid = user.uid;
    console.log(`✓ Firebase Auth user created: ${uid}`);
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      const existing = await auth.getUserByEmail(PRESIDENT_EMAIL);
      uid = existing.uid;
      console.log(`User already exists, using uid: ${uid}`);
    } else {
      throw err;
    }
  }

  await db.collection("members").doc(uid).set(
    {
      email: PRESIDENT_EMAIL,
      displayName: PRESIDENT_NAME,
      phone: PRESIDENT_PHONE,
      role: "president",
      createdAt: new Date().toISOString(),
    },
    { merge: true }
  );

  console.log(`✓ Firestore member document created with role: president`);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  President account ready!`);
  console.log(`  Email:    ${PRESIDENT_EMAIL}`);
  console.log(`  Password: ${PRESIDENT_PASSWORD}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
