import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPER_ADMIN_PASSWORD;

if (!databaseUrl || !email || !password) {
  throw new Error(
    'DATABASE_URL, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD are required. Copy .env.example to .env and set values.'
  );
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  const existingUser = await pool.query(
    'SELECT id, role FROM users WHERE email = $1',
    [email]
  );

  if (existingUser.rowCount > 0) {
    if (existingUser.rows[0].role !== 'SUPER_ADMIN') {
      throw new Error(`Cannot seed Super Admin: ${email} is already used by a non-Super-Admin account.`);
    }

    console.log(`Super Admin already exists for ${email}. No password was changed.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (email, password_hash, role, must_change_password, is_active)
       VALUES ($1, $2, 'SUPER_ADMIN', false, true)`,
      [email, passwordHash]
    );

    console.log(`Seeded Super Admin for ${email}.`);
  }
} finally {
  await pool.end();
}
