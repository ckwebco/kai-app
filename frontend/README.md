# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Run on your iPhone (persistent backend)

1. Create or edit `frontend/.env` and set your machine IP (replace with `ipconfig getifaddr en0` output):

```bash
EXPO_PUBLIC_BACKEND_URL=http://192.168.1.97:8000
```

2. `app.config.js` already injects this value into the app at start so Expo Go and builds will consistently use the backend configured in `frontend/.env`.

3. Start the backend, then start Expo in LAN mode:

```bash
# from repo root
./scripts/dev-start.sh
# or start manually:
# backend: uvicorn backend.server:app --reload --host 0.0.0.0 --port 8000
# frontend: cd frontend && yarn install && expo start --lan
```

4. Open Expo Go on your iPhone (same Wi‑Fi), scan the LAN QR code — the app will use the persistent `EXPO_PUBLIC_BACKEND_URL` value from `frontend/.env`.

If you change your machine IP, update `frontend/.env` accordingly and restart Expo.
