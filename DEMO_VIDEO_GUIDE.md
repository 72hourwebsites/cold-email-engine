# 60-Second Demo Video — Build Guide

**Goal:** A polished, screen-recorded video of a fake iPhone call showing the RingRoute AI handling a restaurant reservation. Drop the resulting Loom/YouTube URL into every `[YOUR 60-SEC DEMO LINK]` placeholder in `REPLY_TEMPLATES.md`.

**Time estimate: 25-35 minutes start to finish.**

---

## What you already have

| Asset | Where | Status |
|---|---|---|
| ElevenLabs generator script | `RingRouteUSAlive/scripts/generate-demo-audio.mjs` | ✅ Working (5 demos already rendered) |
| Rachel voice ID (AI) | `21m00Tcm4TlvDq8ikWAM` | Already in your account |
| Adam voice ID (caller) | `pNInz6obpgDQGcFmaJgB` | Already in your account |
| ElevenLabs API key | Wherever you stored it | You'll set as env var |

## What we just added (in this app)

| New file | Purpose |
|---|---|
| `scripts/generate-restaurant-demo.mjs` | Generates ONE new restaurant-specific MP3 in the same Rachel + Adam voices |
| `demo-video/iphone-call-mockup.html` | Self-contained fake iPhone call UI — loads the MP3, syncs transcript bubbles to audio, displays a live call timer |
| `DEMO_VIDEO_GUIDE.md` | This file |

---

## Step-by-step

### Step 1 — Generate the restaurant audio (~5 min)

```powershell
# Open PowerShell at the cold-email-app folder
cd C:/Users/aml25/Downloads/cold-email-app

# Set your ElevenLabs API key (use your existing key — same one used for the 5 site demos)
$env:ELEVENLABS_API_KEY = "sk_your_key_here"

# Generate the restaurant demo
node scripts/generate-restaurant-demo.mjs
```

You'll see 9 turns synthesize one at a time (~3-5 sec each). When done:

```
✅ Wrote C:/Users/aml25/Downloads/cold-email-app/demo-video/restaurant-demo.mp3 (~250 KB)
```

**Cost:** ~$0.10-0.30 in ElevenLabs credits (700 chars across 9 turns).

### Step 2 — Open the iPhone mockup in your browser (~30 sec)

```powershell
# Just open the HTML file — no server needed
Start-Process "C:/Users/aml25/Downloads/cold-email-app/demo-video/iphone-call-mockup.html"
```

You'll see:
- A dark stage with subtle teal glow
- An iPhone 14-style phone in the center showing "Tavola Bistro · incoming call" with a pulsing avatar
- "RingRoute USA · Live AI Receptionist Demo" branding top-left
- A green "▶ Play Demo Call" button overlay

**Do NOT click Play yet.** First, prep your screen recorder.

### Step 3 — Set up your screen recorder (~3 min)

Pick one:

**Option A — Loom (recommended, free, browser-only)**
1. Go to https://www.loom.com → install the Chrome extension if you haven't
2. Click the Loom extension icon → "Screen + Cam: Off" → "Current Tab"
3. Make sure **system audio capture is ON** (Loom's settings → "Share computer audio")
4. Hit "Start Recording"
5. Switch to the iPhone mockup tab
6. **Press F11** to make it fullscreen (Chrome) — the dark backdrop will fill the entire screen, no browser chrome visible

**Option B — OBS Studio (free, more control)**
- Add a "Window Capture" source pointed at your browser
- Crop tightly around the phone area
- Hit Record

**Option C — Built-in Windows Game Bar (Win+G)**
- Simplest. Press Win+G → click the record button
- Output goes to `Videos/Captures/`

### Step 4 — Record the demo (~90 seconds)

1. Make sure the browser tab is focused (the mockup with "▶ Play Demo Call" visible)
2. Press your screen recorder's start button → switch to the browser
3. **Click "▶ Play Demo Call"**
4. Watch:
   - 1.8 seconds of ringing (pulsing avatar rings)
   - Phone transitions to active call view
   - AI's first line plays as the first transcript bubble appears
   - Caller bubbles alternate in from the right
   - Call timer ticks up
   - Each bubble appears in sync with what's being said
5. When the audio finishes (after ~60 seconds), wait 2 extra seconds (lets the final bubble settle)
6. **Stop recording**

### Step 5 — Trim + upload (~5 min)

1. **Trim the start** — cut anything before "Play Demo Call" was clicked
2. **Trim the end** — cut everything after the final bubble settles
3. Final length should be roughly **62-68 seconds**
4. Upload:
   - Loom: already hosted, just grab the share link
   - YouTube: upload as "Unlisted", get the share URL
   - Google Drive: upload, right-click → Share → "Anyone with the link"

### Step 6 — Wire it into the reply templates (~2 min)

```powershell
# Replace every placeholder in REPLY_TEMPLATES.md
# Use Find & Replace in your editor
# Find:    [YOUR 60-SEC DEMO LINK]
# Replace: https://www.loom.com/share/your-recording-id
```

Or do it manually — there are 7 references in the file. Then you're done.

---

## Quality checks before you send Batch #1

Watch the video back once and grade:
- ☐ Can you hear both voices clearly? (No echo, no clipping)
- ☐ Does the audio finish around 55-65 seconds?
- ☐ Do the transcript bubbles appear roughly in sync with the spoken words? (Doesn't need to be perfect — same paragraph is enough)
- ☐ Does it look professional enough that a restaurant owner would think "this is a real product"? (If no, re-record with system audio louder or browser zoomed in more)
- ☐ Is the "RingRoute USA" branding visible the entire time?

If any of those fail, re-record. Total cost to re-record: $0 (audio is already generated, you just re-do the screen capture).

---

## Customization knobs (if you want to iterate)

**Change the business name** (currently "Tavola Bistro"):
- Edit `TURNS` array in `scripts/generate-restaurant-demo.mjs` AND in `demo-video/iphone-call-mockup.html`
- Regenerate audio + reload HTML

**Change the voice** (currently Rachel for AI):
- Edit `AI_VOICE` constant in the generator script — pick any ElevenLabs voice ID
- Regenerate audio

**Change the caller scenario** (currently reservation + gluten-free + parking):
- Edit `TURNS` in both files — keep it ~9 turns to stay around 60 seconds

**Change the phone color/branding:**
- Edit the CSS variables in `iphone-call-mockup.html` (search for `#00d4a8` — that's RingRoute teal)

**Vertical aspect (for Reels/Shorts/TikTok)**:
- The phone is already 390×844 (portrait). Just crop your screen recording to vertical when uploading to vertical platforms.

---

## Troubleshooting

**"Missing ELEVENLABS_API_KEY"** — set it in PowerShell first: `$env:ELEVENLABS_API_KEY = "sk_..."`

**ElevenLabs returns 401** — your key is invalid or expired. Check https://elevenlabs.io/app/settings/api-keys

**Audio doesn't play in the HTML mockup** — open browser console (F12), check for errors. Most common: `restaurant-demo.mp3` is missing — make sure Step 1 succeeded and the file exists at `demo-video/restaurant-demo.mp3`.

**Transcript bubbles appear too fast/slow vs audio** — the HTML uses char-length-proportional timing. Real ElevenLabs pacing varies. If sync feels off, re-record (the bubbles are usually within 1-2 seconds of the spoken word, which is fine — the viewer sees the bubble = AI just said this).

**Want to add ringing sound effect** — drop a `phone-ring.mp3` file in `demo-video/` and edit the HTML to play it during the 1.8s ringing phase. Free ring SFX on Pixabay.

---

## ⏳ STANDING REMINDER — LAUNCH BLOCKERS (still on you):

- [ ] **Record the 60-sec demo** for `[YOUR 60-SEC DEMO LINK]` — this guide. ~30 min total.
- [ ] Set up Cal.com page for `[YOUR CAL.COM LINK]` — Prompt 2 from the browser-Claude commands handles this
- [ ] Confirm ReachInbox reply forwarding to `dominiiking@gmail.com` — Prompt 3 handles this

Built 2026-05-23. Adapt as you iterate.
