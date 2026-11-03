# Waitlist → Google Sheet

The early-access forms on `/` (Worn Play) and `/closet` (Worn Closet) post each sign-up to a Google
Apps Script web app, which adds a row to a Google Sheet. It's free and needs no server.

Until `NEXT_PUBLIC_WAITLIST_URL` is set, the forms fall back to an email button addressed to
`hello@worncloset.app`.

## Set it up (about 5 minutes)

1. Create a Google Sheet, e.g. "Worn waitlist".
2. In the Sheet: **Extensions → Apps Script**. Delete the sample code and paste in
   [`apps-script.gs`](./apps-script.gs). Save.
3. **Deploy → New deployment**. Type: **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**

   Deploy, approve the permission prompt (it asks to edit this spreadsheet), and copy the **Web app
   URL** (`https://script.google.com/macros/s/…/exec`).
4. Check it: open the URL in a browser. It should show `{"ok":true,"service":"worn-waitlist"}`.
5. In the website's hosting settings, set `NEXT_PUBLIC_WAITLIST_URL` to that URL for Production (and
   Preview if you want), then redeploy. It's read at build time.

The first sign-up creates a **Waitlist** tab with the columns: Signed up, Email, List (`play` or
`closet`), Page, Referrer. A second sign-up with the same email for the same list is not added again.

## Changing the script later

Edit the code, then **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Editing the
existing deployment keeps the same URL; creating a new deployment gives a new URL you'd have to set
again.

## Notes

- "Anyone" access means anyone with the URL can post a sign-up. The script only accepts a valid email
  and a known list, and ignores bots that fill the hidden `website` field. So that nothing a visitor
  sends can become a live formula in the Sheet, it refuses emails that start with `=`, `+`, `-` or `@`
  or contain quotes, brackets, `&`, `;`, `<`, `>` or backslashes, and every visitor value (email, page,
  referrer) is written through `cell()`, which stores text that starts like a formula as plain text.
- **If you deployed an earlier version of the script**, deploy this one as a new version (below): the
  earlier one wrote the email without those checks. Scan the Email column for anything starting with
  `=`, `+`, `-` or `@` and delete those rows.
- Apps Script's free quota is far beyond what a waitlist needs.
- To get an email for each sign-up, add `MailApp.sendEmail('you@gmail.com', 'New Worn sign-up', email)`
  after `appendRow` in `doPost` (it will ask for one more permission on the next deploy).
