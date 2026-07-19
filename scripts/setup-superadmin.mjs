import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Designate the SUPER ADMIN (system owner).
 *
 * The super admin sits above every church role and cannot be assigned from inside
 * the app (there is no UI for it — that is deliberate). This one-time script promotes
 * an existing account to super_admin using the Admin SDK.
 *
 * Usage:
 *   node scripts/setup-superadmin.mjs someone@example.com
 *
 * The account must already exist (register through the app first, or use
 * setup-president.mjs). Re-running is safe and idempotent.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

const serviceAccount = JSON.parse(
  readFileSync(
    resolve(__dirname, "../../../Downloads/ypg-pcg-firebase-adminsdk-fbsvc-27cc20014b.json"),
    "utf8"
  )
);

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

const email = process.argv[2];

async function main() {
  if (!email) {
    console.error("✗ Provide an email:  node scripts/setup-superadmin.mjs owner@example.com");
    process.exit(1);
  }

  let user;
  try {
    user = await auth.getUserByEmail(email);
    console.log(`Found existing account: ${user.uid}`);
  } catch {
    // Create the auth record WITHOUT a password. The owner sets their own password
    // via the "Forgot Password" flow on the login screen — no password is handled here.
    user = await auth.createUser({ email, displayName: "SAVIOUR YPG", emailVerified: true });
    console.log(`Created new auth account: ${user.uid}`);
    console.log(`→ On the login page, use "Forgot Password" with ${email} to set your password.`);
  }

  const ref = db.collection("members").doc(user.uid);
  const snap = await ref.get();

  await ref.set(
    {
      email,
      displayName: "SAVIOUR YPG",
      role: "super_admin",
      createdAt: snap.exists ? snap.data().createdAt ?? new Date().toISOString() : new Date().toISOString(),
    },
    { merge: true }
  );

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ✓ Super Admin designated`);
  console.log(`  Email: ${email}`);
  console.log(`  UID:   ${user.uid}`);
  console.log(`  This account now has full back-office access at /dashboard/console`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
