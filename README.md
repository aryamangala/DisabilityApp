# DisabilityApp
An app to translate complex legal and medical documents into an EasyRead format for individuals with intellectual disabilities to have greater autonomy

# EasyRead App - Setup Guide for Mac

A document processing app that converts complex legal documents into EasyRead format for individuals with intellectual disabilities. Built with Node.js/Express backend and Expo React Native mobile app.

## Prerequisites

Before you begin, ensure you have the following installed on your Mac:

### 1. Node.js and npm
- **Node.js** (version 16 or higher recommended)
- **npm** (comes with Node.js)

To check if you have them installed:
```bash
node --version
npm --version
```

If not installed, download from: https://nodejs.org/

### 2. Expo CLI (for mobile app)
```bash
npm install -g expo-cli
```

Or use npx (no installation needed):
```bash
npx expo --version
```

### 3. OpenAI API Key (backend only)

- Sign up at https://platform.openai.com/
- Create an API key from https://platform.openai.com/api-keys
- **Never** put this key in the mobile app or in any `EXPO_PUBLIC_*` variable (those values ship in the client bundle). Use `backend/.env` locally and your host’s secret store in production (e.g. Railway variables).

## Project Structure

```
easyread/
├── backend/          # Node.js/Express backend server
│   ├── .env         # Environment variables (API key)
│   ├── server.mjs   # Main server file
│   └── ...
└── mobile/          # Expo React Native mobile app
    ├── src/         # Source code
    └── ...
```

## Setup Instructions

### Step 1: Backend Setup

1. **Navigate to backend directory:**
   ```bash
   cd easyread/backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create `.env` file:**
   Copy `backend/.env.example` to `backend/.env` and set `OPENAI_API_KEY` and optional vars. Do not commit `.env`.

4. **Initialize the database:**
   The database will be created automatically when you start the server.

### Step 2: Mobile App Setup

1. **Navigate to mobile directory:**
   ```bash
   cd easyread/mobile
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install Expo CLI (if not already installed):**
   ```bash
   npm install -g expo-cli
   ```

4. **Configure backend URL (mobile):**
   Copy `mobile/.env.example` to `mobile/.env` and adjust:
   - **Test against hosted API (default):** set `EXPO_PUBLIC_BACKEND_URL` to your HTTPS API (same host as `defaultPublicBackend.json` / `eas.json`).
   - **Simulator/emulator + local `npm start` backend:** set `EXPO_PUBLIC_USE_LOCAL_BACKEND=true` (and leave `EXPO_PUBLIC_BACKEND_URL` unset) so Android emulator uses `10.0.2.2:4000` and iOS simulator uses `127.0.0.1:4000`.
   - **Physical device + local backend:** set `EXPO_PUBLIC_BACKEND_URL=http://YOUR_LAN_IP:4000` (phone must reach that IP).
   
   Resolution order and release safety are implemented in `mobile/src/backendResolution.js` (local/LAN URLs are ignored in release builds).
   
   To find your Mac's LAN IP:
   ```bash
   ipconfig getifaddr en0
   ```

## Running the Application

### Terminal 1: Start the Backend Server

```bash
cd easyread/backend
npm start
```

You should see:
```
EasyRead backend listening on port 4000
```

The server will run on `http://localhost:4000`

### Terminal 2: Start the Mobile App

```bash
cd easyread/mobile
npm start
```

Or using Expo CLI:
```bash
npx expo start
```

This will open the Expo development tools. You can then:

- **Press `w`** to open in web browser
- **Press `a`** to open in Android emulator (requires Android Studio)
- **Scan QR code** with Expo Go app on your phone (iOS/Android)

## Testing Options

### Option 1: Web Browser (Easiest)
1. Start backend server
2. Start mobile app with `npm start`
3. Press `w` to open in browser
4. App will open at `http://localhost:8081` or `http://localhost:19006`

### Option 2: Physical Device (Recommended for mobile testing)
1. Install **Expo Go** app on your phone:
   - iOS: App Store
   - Android: Google Play Store
2. Ensure phone and Mac are on the same Wi-Fi network
3. Set `EXPO_PUBLIC_BACKEND_URL=http://YOUR_MAC_LAN_IP:4000` in `mobile/.env`
4. Start backend server
5. Start mobile app
6. Scan QR code with Expo Go app

### Option 3: Android Emulator
1. Install **Android Studio** from https://developer.android.com/studio
2. Set up Android SDK and create an emulator
3. Set `ANDROID_HOME` environment variable:
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```
4. Start emulator from Android Studio
5. Start mobile app and press `a`

## Common Issues and Solutions

### Backend Issues

**Port 4000 already in use:**
```bash
# Find process using port 4000
lsof -ti:4000

# Kill the process
kill -9 $(lsof -ti:4000)
```

**OpenAI API key error:**
- Verify `.env` file exists in `easyread/backend/`
- Check that `OPENAI_API_KEY` is set correctly
- Restart the backend server after updating `.env`

**Database errors:**
- Delete `easyread/backend/easyread.db` and restart server (will recreate)

### Mobile App Issues

**Web app not opening:**
- Manually open `http://localhost:8081` or `http://localhost:19006` in browser
- Or press `w` again in the Expo terminal

**Cannot connect to backend:**
- Verify backend is running on port 4000
- Check `EXPO_PUBLIC_BACKEND_URL` / `EXPO_PUBLIC_USE_LOCAL_BACKEND` in `mobile/.env` (see `backendResolution.js`)
- For physical device, ensure Mac and phone are on same network

**Missing dependencies:**
```bash
cd easyread/mobile
npm install
npx expo install expo-asset expo-linear-gradient
```

**Android SDK not found:**
- Install Android Studio
- Set `ANDROID_HOME` environment variable (see Option 3 above)

## Features

- **Document Import**: Upload PDFs, take photos, or paste text
- **EasyRead Conversion**: Automatically converts documents to EasyRead format
- **Chunked Reading**: Documents are split into manageable chunks
- **Previous Files**: View and manage previously processed documents
- **Settings**: Adjust text size and language (English/Spanish)
- **Bilingual Support**: Full UI in English and Spanish

## API Endpoints

- `GET /documents` - List all documents
- `GET /documents/:docId` - Get document details
- `GET /documents/:docId/chunks/:i` - Get specific chunk
- `POST /documents` - Upload/create document
- `DELETE /documents` - Delete all documents
- `DELETE /documents/:docId` - Delete specific document

## Development Notes

- Backend uses SQLite database (`easyread.db`)
- EasyRead translations are generated using OpenAI GPT-4o
- All EasyRead translations are stored in the database
- Background processing generates EasyRead for all chunks automatically

## Troubleshooting

If you encounter issues:

1. **Check backend logs** in Terminal 1 for errors
2. **Check mobile app logs** in Terminal 2 or browser console
3. **Verify environment variables** are set correctly
4. **Restart both servers** after making changes
5. **Clear cache** if needed:
   ```bash
   cd easyread/mobile
   npx expo start -c
   ```

## Support

For issues or questions, check:
- Backend terminal for server errors
- Browser console (F12) for web app errors
- Expo terminal for mobile app errors

---

**Happy coding! 🚀**
