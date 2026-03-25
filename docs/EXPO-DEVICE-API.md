# Running the app on a physical device (Expo Go)

When you run the app on your **phone** (via QR code or tunnel), it needs to reach your **API** to load campaigns, categories, and donations. If the app shows empty "Feature Campaign", "Categories", and "Latest Campaign", the phone cannot reach the API.

## Fix: point the app at the public API

1. In the project root `.env`, set the API URL to your **public** backend (so the phone can reach it):

   ```env
   EXPO_PUBLIC_API_URL=https://giveblackapp.com/app
   ```

   Do **not** use `http://localhost:5001` when testing on a physical device — on the phone, "localhost" is the phone itself, so the request will fail and lists stay empty.

2. Restart Expo so it picks up the new env:

   ```bash
   npx expo start --tunnel
   ```

   Or use the same command you normally use (e.g. `npx expo start --port 8082`), then scan the QR code again.

3. Ensure your API is actually reachable at that URL (e.g. `https://giveblackapp.com/app/api/organizations` returns JSON). If the API runs only on your machine, the phone still cannot reach it; use the tunnel for the dev server and the public URL for the API.

After this, the home screen should load organizations and categories from the API and show your main app content.
