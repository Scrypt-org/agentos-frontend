# Quick Start - NFC Testing

## 🚀 Deploy to Vercel Now

### Option 1: Vercel CLI (Fastest)

```bash
# Install Vercel CLI
npm i -g vercel

# Navigate to project root
cd ~/projects/inj-pass-frontend

# Login to Vercel
vercel login

# Deploy frontend
vercel --prod

# You'll get a URL like: https://your-app.vercel.app
```

### Option 2: Vercel Dashboard

1. Go to https://vercel.com
2. Click "Add New Project"
3. Import from Git
4. Select repository: `injpass-nfc`
5. Framework: **Next.js**
6. Root Directory: **`frontend`**
7. Click "Deploy"

## 📱 Test on Android

### Step 1: Check Requirements

Visit on your Android Chrome:
```
https://your-app.vercel.app/nfc-test
```

You should see:
- ✅ API Support: Supported
- ✅ HTTPS: Secure
- ✅ Browser: Chrome

### Step 2: Create Wallet (if needed)

1. Go to home page
2. Click "Create with Passkey"
3. Verify with fingerprint/face
4. Wallet created!

### Step 3: Test Card Binding

1. Go to **Cards** page
2. Click **"Add New Card"**
3. Click **"Tap Card Now"**
4. **Hold NFC card to back of phone** (near camera area)
5. Keep card steady for 2-3 seconds
6. Verify with Passkey (fingerprint/face)
7. ✅ Success! Card should appear in list

### Step 4: Test Card Scanning

1. Go to **Send** page
2. Click the **wave icon** next to "Recipient Address"
3. **Tap the same NFC card** to phone
4. ✅ Address should auto-fill!

## 🎯 Expected Results

### ✅ Successful Binding
- Card appears in Cards list
- Card shows: Name, Number, Date, CVV
- Can flip card to see management options
- Card is saved in localStorage

### ✅ Successful Scanning
- Modal opens with scanning animation
- Address auto-fills in Send page
- Modal closes automatically
- Can proceed to send transaction

## 🐛 Troubleshooting

### NFC Not Detected

**Problem:** "NFC is not supported"

**Solutions:**
1. Confirm using **Chrome** on Android
2. Check NFC enabled in phone settings
3. Ensure site is **HTTPS** (not HTTP)
4. Try reloading page

### Scan Timeout

**Problem:** "NFC scan timeout"

**Solutions:**
1. Hold card **very close** to phone back
2. Keep card **steady** for 2-3 seconds
3. Try different position on phone
4. Try different card (some cards don't work)

### Permission Denied

**Problem:** "NFC permission denied"

**Solutions:**
1. Go to Chrome settings
2. Site settings → Permissions
3. Clear site data
4. Try again, allow permission

### Card Already Bound

**Problem:** "This card is already bound"

**Solutions:**
1. Use a different card, OR
2. Unbind existing card first (requires Passkey)

## 📊 Debugging

### View Console Logs

1. Connect phone via USB
2. Enable USB debugging on phone
3. Open `chrome://inspect` on desktop
4. Click "Inspect" next to your app
5. Watch Console tab for `[NFC]` logs

### Test Page

Use the diagnostic page:
```
https://your-app.vercel.app/nfc-test
```

Features:
- NFC support status
- Browser info
- Live scan test
- Debug logs viewer

## 🎴 Recommended NFC Cards

### Best for Testing
- **NTAG215** - Most common, cheap ($0.50-1 each)
- **NTAG216** - Larger storage
- **Mifare Classic 1K** - Widely available

### Where to Buy
- **Amazon:** Search "NFC cards blank NTAG215"
- **AliExpress:** 10-pack NTAG215 cards
- **Local electronics store**

### Card Specs
- Type: ISO 14443 Type A
- Memory: ≥144 bytes (NTAG215 has 504 bytes)
- Frequency: 13.56 MHz
- Must be **writable** (not read-only)

## ✅ Success Checklist

- [ ] App deployed to Vercel
- [ ] Opened on Android Chrome
- [ ] NFC test page shows all green
- [ ] Wallet created with Passkey
- [ ] NFC card successfully bound
- [ ] Card appears in Cards list
- [ ] Card data written to NFC
- [ ] Card successfully scanned in Send page
- [ ] Address auto-filled from card
- [ ] Can freeze/unfreeze card
- [ ] Can view QR code
- [ ] Can unbind card

## 🎉 Next Steps

After successful testing:

1. **Test Multiple Cards**
   - Bind 2-3 different cards
   - Verify each one works
   - Check localStorage persistence

2. **Test All Features**
   - Flip card to see management
   - Freeze/unfreeze
   - View QR code
   - Unbind (requires Passkey)

3. **Test Edge Cases**
   - Empty card (no address)
   - Duplicate binding attempt
   - Scan timeout
   - Permission denial

4. **Share Results**
   - Take screenshots
   - Note any errors
   - Report success/issues

## 🆘 Getting Help

If you encounter issues:

1. **Check Console Logs**
   - Look for `[NFC]` prefixed messages
   - Note any error messages

2. **Check Diagnostic Page**
   - Visit `/nfc-test`
   - Verify all checks are green

3. **Check Phone Settings**
   - NFC enabled
   - Chrome up to date
   - Sufficient storage

4. **Try Different Card**
   - Some cards are incompatible
   - Try NTAG215 cards

## 📝 Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Not supported | Wrong browser/OS | Use Android Chrome |
| Timeout | Card too far | Hold closer, steady |
| Permission denied | Blocked by user | Clear data, retry |
| Already bound | Duplicate card | Use different card |
| Write failed | Read-only card | Try writable card |

---

**Ready to test?** Deploy now and start tapping! 🎉

**Deployment URL:** `vercel --prod` (run in `/frontend` directory)

**Test Page:** `https://your-app.vercel.app/nfc-test`

**Time Required:** ~5 minutes to deploy, ~5 minutes to test
