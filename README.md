# Custody Record — putting it on your iPad

A private, offline record-keeping app for an iPad. This repository hosts it with GitHub Pages:

**https://ctotheb11.github.io/CustodyApp/**

It has to be loaded from that address **once**. After you add it to your Home Screen it runs offline, and your entries are stored only on the iPad.

> These files contain **no personal data** — no names, no entries. Your names and records exist only inside the app on your iPad.

## 1. Install it on the iPad

1. Open the address above in **Safari** on the iPad.
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. **Close Safari and open the app from the new Home Screen icon.** Always use the icon.
   Safari tabs and the installed app keep *separate* storage, so data entered in a Safari tab won't appear in the app.

## 2. Bring in your spreadsheets

1. Get the two `.xlsm` files onto the iPad. Easiest: email them to yourself, or save them to iCloud Drive, then save them in the **Files** app.
2. In the app: **Settings** → enter the child's name, your label, and the other parent's name → **Save settings**.
3. **Settings → Import from Excel → Choose spreadsheet files** → select both files → check the preview → **Import**.
   Importing the same file again later is safe; rows already imported are skipped.

## 3. Back up regularly

**Settings → Back up now** → save the file to iCloud Drive (or email it to yourself). If the app is ever removed from the iPad, its data is removed too. A backup is the only way to get it back (**Settings → Restore from backup**). The app reminds you if it has been more than a week.

## Making a report for your attorney or the court

**Reports** → pick the period and sections → **Create report** → **Print / Save PDF**. In the print screen, use the Share button to save the PDF to Files or email it.

- Each entry has a permanent number (e.g. `VIS-0012`) that you can cite.
- Each entry shows when it was entered and how many times it was edited. You can include the full edit history.
- Attorney notes and follow-up fields are left out by default.
- The report ends with a SHA-256 "fingerprint" of its contents. If any included entry changes, the fingerprint changes.
- **Reports → Spreadsheet export** gives CSV files your attorney can open in Excel.

## Updating the app later

If the app is changed, push the new files to this repository. The iPad downloads the update the next time the app is opened online, and shows it the time after that. Your data is unaffected.
