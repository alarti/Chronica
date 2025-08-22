# Chronica: Infinite Stories

Chronica: Infinite Stories is a multilingual, AI‑driven narrative web RPG. Each scene is generated dynamically (text + artwork) and stored per player.  
Created by **Alberto Arce**.

## 🌐 Multilingual
- Languages: English (EN), Español (ES), Français (FR), Deutsch (DE), 中文 (ZH)
- Language picker on first screen using flag icons
- All UI strings and narrative content localized; stored as i18n resources

## 🔐 Authentication & Persistence
- **Google Sign‑In (OAuth 2.0)** for secure login
- **Supabase** for sessions, choices, inventory, and progress

## 🤖 AI Engines
- **Pollinations** as the text and image generation platform
  - Text: Pollinations text generation endpoints
  - Images: Pollinations image endpoints from concise `imagePrompt`
- Narrative orchestration via a prompt contract ensuring:
  - 200‑word scenes
  - 3 meaningful choices
  - Clean image prompts
  - State deltas for flags/inventory/affinity
  - Full localization

## 🧩 Core Loop
1. Player selects language (flag picker) and signs in with Google.
2. Client requests next scene using Pollinations text endpoint with the standardized prompt contract.
3. Receives JSON: `story`, `options`, `imagePrompt`, `sceneTags`, `ui`, `stateDelta`, `credits`.
4. Renders localized UI, shows AI image from Pollinations using `imagePrompt`.
5. Applies `stateDelta` and persists to Supabase.
6. Player chooses an option → loop continues.

## 🛠 Tech Stack
- Frontend: JavaScript (Vanilla/ESM) + minimal state machine
- Auth/DB: Supabase (Auth helpers, PostgREST, Row Level Security)
- AI: Pollinations (text + images)
- Hosting: Vercel/Netlify (recommended)
- i18n: JSON resource bundles + small runtime i18n helper


## 🔧 Environment Variables
Copy `.env.example` to `.env` and set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GOOGLE_CLIENT_ID`
- `POLLINATIONS_API_URL` (base for text)
- `POLLINATIONS_IMAGE_URL` (base for images)
- `APP_DEFAULT_LANG` (e.g., `en`)

## 🚀 Getting Started
git clone https://github.com/youruser/chronica.git
cd chronica
npm install
npm run dev

## 🧪 Data Model (Supabase)
- `profiles`: id (uuid), email, display_name, lang
- `sessions`: id, user_id, created_at, last_state (jsonb)
- `events`: id, session_id, turn, choice, state_delta (jsonb), created_at

RLS suggestion: users can only read/write rows where `user_id = auth.uid()`.

## 🔌 API Integration (Pollinations)
- Text generation: build a POST with the narrative prompt contract; expect strict JSON back (validate and retry if needed).
- Image generation: GET/POST using `imagePrompt`; cache URLs per scene.

Resilience tips:
- Enforce schema with a JSON validator.
- On invalid JSON, request regeneration with a “fix JSON” system prompt.
- Timeout and retry with exponential backoff.

## 🗺️ i18n Strategy
- UI strings in `/src/i18n/{lang}.json`.
- Language selected via flag picker; persisted to profile.
- Narrative `lang` sent to the generator; all fields must be localized.
- Fallback chain: user → browser → `APP_DEFAULT_LANG`.

## 🧱 UI/UX Notes
- Start screen: language flags + “Continue with Google”.
- Scene layout: title, story, 3 choices, illustration, subtle toast.
- Accessibility: large tap targets, readable fonts, color contrast.

## 🔒 Safety & Content
- Family‑friendly; no disallowed content.
- No copyrighted characters or artist names in prompts.
- Filter/escape user inputs before logging or storage.

## 🗃️ Scripts
{
"scripts": {
"dev": "vite",
"build": "vite build",
"serve": "vite preview",
"lint": "eslint ."
}
}

## 📌 Roadmap
- [x] Architecture draft
- [ ] Google OAuth + profile bootstrap
- [ ] Supabase data model + RLS
- [ ] Pollinations text integration
- [ ] Pollinations image integration
- [ ] JSON schema validator + retries
- [ ] Full i18n resources (EN/ES/FR/DE/ZH)
- [ ] Save/Load session + cloud sync
- [ ] Offline cache for last scene
- [ ] Basic analytics (privacy‑safe)

## 📝 Credits
Created by **Alberto Arce**.

