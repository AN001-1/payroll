# Maison Rotterdam Payroll Portal

A local Node/SQLite payroll portal with separate payroll-admin and employee views. Employees sign in with their phone number or email. Admins can see employee usernames and request password resets, but never see employee passwords.

Payroll figures are illustrative only and are not Moroccan statutory calculations or legal advice.

## Run locally

Requires Node.js 24 or newer. The app is served by Express; opening `index.html` directly will not provide API or authentication functionality.

```sh
npm install
cp .env.example .env
```

Set `ADMIN_USERNAME` and a unique `ADMIN_PASSWORD` of at least 12 characters in `.env`. This creates the admin for a new database or rotates the existing admin credentials on restart. Employee records are added by an administrator in **Employees**; the app does not create preset employee accounts. Existing SQLite records are preserved when the app starts.

```sh
npm run dev
```

Open `http://localhost:8000`. On this development machine, Node was installed under `~/.local/share/node-v24.21.0-darwin-arm64`; if the `node` command is not found in a new terminal, add it to `PATH` first:

```sh
export PATH="$HOME/.local/share/node-v24.21.0-darwin-arm64/bin:$PATH"
```

The server hashes passwords before storing them. SQLite data is stored under `data/` and is not written to browser storage.

For phone access on the same Wi-Fi, set `PUBLIC_URL` in `.env` to the Mac's local network address, such as `http://192.168.1.20:8000`, and open the same address on the phone. Development is HTTP only; do not use real passwords or employee records over this connection.

## Password resets

In **Employees**, the admin can see each employee's username and whether password setup is complete. **Create reset link** issues a one-time link that expires after 10 minutes. With the default development setting (`SMS_PROVIDER=console`), the link is written to the server terminal for testing. The admin never receives or sees the password the employee chooses.

To send reset links by SMS, set `SMS_PROVIDER=vonage` and configure `VONAGE_API_KEY`, `VONAGE_API_SECRET`, and `VONAGE_FROM` in `.env`. `VONAGE_FROM` must be a Vonage-approved sender for the destination country. Employee phone numbers must be in international format (for example, `+212...`). Set `PUBLIC_URL` to an HTTPS address the employee can reach for real password resets. Never commit `.env` or share provider credentials in chat.

The backend accepts reset passwords of 12 to 128 characters, hashes them with scrypt, stores only a hash of each reset token, expires links after 10 minutes, and invalidates other employee sessions after a successful reset.

## Verification

```sh
npm test
```

The tests cover unauthenticated access, employee record isolation, admin-only writes, and one-time password resets.

## Security limits

This is a local-development prototype, not a production payroll system. Production mode requires an HTTPS `PUBLIC_URL`, a strong `SESSION_SECRET`, an admin username and password, and Vonage configuration. It still needs deployment-specific review, MFA, audit logging, encrypted backups/storage, operational monitoring, and qualified payroll review before handling real employee information. SQLite itself is not encrypted by this app.

No Moroccan payroll compliance is claimed. Do not use illustrative calculations to pay staff or enter real employee information in the development setup.