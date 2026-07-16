# Deploying to Vercel for NFC Testing

## Why Vercel?

The Web NFC API requires HTTPS to work (except on localhost). Vercel provides free HTTPS out of the box, making it perfect for testing NFC features on real Android devices.

## Deployment Steps

### 1. Prepare Your Code

Make sure all changes are committed:

```bash
cd ~/projects/inj-pass-frontend
git add .
git commit -m "Add NFC card features"
```

### 2. Install Vercel CLI (Optional)

```bash
npm i -g vercel
```

### 3. Deploy via Vercel Dashboard

1. Go to https://vercel.com
2. Sign in with GitHub
3. Click "Add New Project"
4. Import your `injpass-nfc` repository
5. Configure:
   - Framework Preset: **Next.js**
   - Root Directory: **frontend**
   - Build Command: `npm run build`
   - Output Directory: `.next`
6. Add Environment Variables:
   - `NEXT_PUBLIC_API_URL`: Your backend API URL (if deployed separately)
7. Click "Deploy"

### 4. Deploy Backend (if needed)

If you need to deploy the backend:

1. Create a new Vercel project for the backend
2. Root Directory: **backend**
3. Add Environment Variables:
   - `JWT_SECRET`: (copy from backend/.env)
   - `RP_ID`: Your Vercel domain (e.g., `your-app.vercel.app`)
   - `ORIGINS`: `https://your-frontend.vercel.app`

### 5. Update Frontend Environment

After deploying backend, update frontend environment:

1. Go to frontend Vercel project settings
2. Environment Variables
3. Update `NEXT_PUBLIC_API_URL` to your backend URL
4. Redeploy

## Testing on Android Device

1. Open Chrome on your Android phone
2. Navigate to your Vercel URL: `https://your-app.vercel.app`
3. Create or unlock your wallet with Passkey
4. Go to Cards page
5. Click "Add New Card"
6. Hold your NFC card to the back of your phone
7. The app will prompt for Passkey verification
8. After verification, your wallet address is written to the card

## Troubleshooting

### NFC Not Working

- ✅ Confirm you're using Chrome on Android (not iOS, not other browsers)
- ✅ Ensure NFC is enabled in phone settings
- ✅ Check that site is HTTPS (not HTTP)
- ✅ Try reloading the page if permission was denied
- ✅ Make sure NFC card is compatible (ISO 14443 Type A/B or Type F)

### Passkey Not Working

- ✅ Ensure backend `RP_ID` matches your frontend domain
- ✅ Check `ORIGINS` includes your frontend URL
- ✅ Try clearing browser data and re-registering

### CORS Errors

- ✅ Check backend `ORIGINS` environment variable
- ✅ Ensure both frontend and backend are on HTTPS
- ✅ Verify API URL is correct in frontend environment

## Vercel Configuration Files

### Frontend (vercel.json)

```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

### Backend (vercel.json)

```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/main.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/main.js"
    }
  ]
}
```

## Local Testing (without NFC)

For development without NFC hardware:

1. Use browser DevTools to simulate Android device
2. NFC scanning will show "not supported" error
3. You can test other features normally
4. NFC features must be tested on real Android device

## Production Checklist

- [ ] Frontend deployed to Vercel with HTTPS
- [ ] Backend deployed with correct environment variables
- [ ] `RP_ID` matches frontend domain
- [ ] `ORIGINS` includes frontend URL
- [ ] Tested wallet creation with Passkey
- [ ] Tested NFC card binding on Android Chrome
- [ ] Tested NFC card scanning in Send page
- [ ] Tested card management (freeze, unbind)
- [ ] Confirmed QR code display works
