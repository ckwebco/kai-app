# Here are your Instructions

This app is configured to run locally for your personal use only. You do not need to publish it to use it on your iPhone via Expo Go.

## Run locally for your phone

1. Make sure these values are set:
   - `frontend/.env` should contain `EXPO_PUBLIC_BACKEND_URL=http://<your-mac-ip>:8000`
   - `backend/.env` should contain `MONGO_URL` and `DB_NAME`

2. Start the app with the local runner:

```bash
cd '/Users/RealNibblets/Downloads/Kai-App-main-9 3'
chmod +x ./scripts/run-phone.sh ./scripts/stop-phone.sh
./scripts/run-phone.sh
```

3. Open Expo Go on your iPhone and scan the QR code from the terminal or use the persistent URL:

```text
exp://192.168.1.97:8086
```

4. To stop the local server and Expo:

```bash
./scripts/stop-phone.sh
```

## Notes

- If you close the terminal, the app will still keep running because `run-phone.sh` starts the backend and Expo in the background.
- If you want to restart later, just run `./scripts/run-phone.sh` again.
- You do not need to publish this app to use it personally.
