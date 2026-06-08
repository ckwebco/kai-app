# MacroTrack AI – Mobile (Expo)

Personal nutrition tracker — Expo React Native + FastAPI + MongoDB + Gemini 3.1 Pro vision.

## Features
1. **Live AI Photo Scan** (`/scan-camera`) — full-screen camera, Gemini 3.1 Pro returns dish name + ingredient-level macros.
2. **Live Barcode Scanner** (`/scan-barcode`) — native barcode detection + Open Food Facts lookup + auto-log.
3. **Add Food modal** (`/quick-add`, 4 tabs):
   - **Search** — Open Food Facts (1M+ foods) with debounced live results + thumbnails.
   - **Voice / AI** — natural-language parse via Gemini ("two slices of toast with PB" → structured macros).
   - **Quick** — kcal + macros only.
   - **Recent** — repeat any past meal.
4. **Recipes** (`/recipes`) — build composite meals (search ingredients, set quantities, save), log a serving with one tap.
5. **Quantity selector** — smart unit-aware (slices, gummies, cups, g) with ± stepper.
6. **Dashboard**:
   - Calories ring + macros donut (kcal-weighted P/C/F %)
   - Macro bars vs daily goals
   - **Weekly bar chart** (calories vs goal, last 7 days)
   - **Macro trend lines** (P/C/F over the week)
   - Water tracker with ½ / 1 cup buttons
   - Meal diary grouped by Breakfast/Lunch/Dinner/Snack with delete
7. **Undo snackbar** for all delete + log actions (5s window).
8. **Meal-type picker** on every log action.
9. **Meal presets** on Log tab (8 common foods, one-tap log).
10. **Activity tracker** with workout presets and calorie burn estimates.
11. **Dark mode toggle** in Profile (persistent).
12. **Profile & daily macro goals** stored locally.

## Backend API (`/api/*`)
- AI: `POST /analyze-food` (image base64), `POST /parse-food-text` (natural language)
- Lookups: `GET /barcode-lookup/{code}`, `GET /food-search?q=`
- Logs (full CRUD): `food-log`, `weight-log`, `water-log`, `activity-log`, `recipes`
- `GET /weekly-summary?end_date=YYYY-MM-DD` (7-day aggregate)

## Installing on your phone (no App Store needed, FREE)
1. Install **Expo Go** from App Store / Google Play.
2. From Emergent, scan the QR code shown in the project preview with Expo Go.
3. The app opens inside Expo Go — pin it to a home-screen folder for one-tap access.

For a true standalone home-screen icon, use Emergent's **Publish** button (paid) or `eas build` to build a personal APK (Android free, iOS needs $99/yr Apple Developer).

## Verification
- 17/17 backend tests passing (`/app/backend/tests/test_macrotrack.py`).
- Gemini 3.1 Pro vision verified on Wikimedia food photo → ingredient breakdown.
- Open Food Facts integration verified (Thai Kitchen barcode + banana search returning real products with images).
- Voice/NL parse verified ("two slices of toast with PB" → 2 servings, slice unit, 350 kcal total).
