# Email Configuration for Peer Tutors System

## SMTP Settings
Add these to your `.env.local` file:

```env
# SMTP settings for sending emails with attachments
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Admin email (fallback if not in database)
ADMIN_EMAIL=admin@peertutors.edu
```

## For Gmail:
1. Enable 2-factor authentication
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the app password as `SMTP_PASS`

## For Outlook/Office 365:
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```
