import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const sql = fs.readFileSync("supabase/migrations/20260922180000_wholesale_multi_payment_tracking.sql", "utf-8");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("Applying migration 20260922180000_wholesale_multi_payment_tracking.sql...");
  const res = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({ query: sql })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Migration error:", res.status, text);
    process.exit(1);
  }

  console.log("Migration applied successfully!");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
