/**
 * Generates ONE restaurant-specific ElevenLabs demo clip in the same Rachel + Adam
 * voices used by the existing 5 RingRoute USA demos.
 *
 * Output: cold-email-app/demo-video/restaurant-demo.mp3
 *
 * Usage (PowerShell):
 *   $env:ELEVENLABS_API_KEY = "sk_xxx"
 *   node scripts/generate-restaurant-demo.mjs
 *
 * Estimated cost: ~$0.10-0.30 in ElevenLabs credits (~700 chars across 9 turns).
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'demo-video');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'restaurant-demo.mp3');

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('Missing ELEVENLABS_API_KEY env var.');
  console.error('Set it from your existing ElevenLabs account:');
  console.error('  $env:ELEVENLABS_API_KEY = "sk_your_key_here"');
  process.exit(1);
}

// Same voices the website uses for demo-1 through demo-5
const AI_VOICE     = '21m00Tcm4TlvDq8ikWAM'; // Rachel — calm professional AI receptionist
const CALLER_VOICE = 'pNInz6obpgDQGcFmaJgB'; // Adam — natural male caller

// 9 turns, ~60 seconds at natural ElevenLabs pacing.
// Restaurant-specific signals: table-for-N, gluten-free, parking validation, SMS confirm.
const TURNS = [
  { speaker: 'ai',     text: "Thank you for calling Tavola Bistro. I'm your AI hostess — how can I help you today?" },
  { speaker: 'caller', text: "Hi, I'd like to book a table for four this Saturday around 7 PM." },
  { speaker: 'ai',     text: "Wonderful! We have a 7:15 opening — would that work?" },
  { speaker: 'caller', text: "Yes, perfect. The name's Mike." },
  { speaker: 'ai',     text: "Got it, Mike. Table for four, this Saturday at 7:15. Anything we should know — allergies, celebrations, anything special?" },
  { speaker: 'caller', text: "Actually yes — one of us is gluten-free. Do you have options?" },
  { speaker: 'ai',     text: "We do. Our pasta has a gluten-free substitute, and the branzino and short rib are both naturally gluten-free. I'll note it on the reservation." },
  { speaker: 'caller', text: "Perfect. Do you guys validate parking?" },
  { speaker: 'ai',     text: "We do — two hours free at the garage on 4th. I'll text you the confirmation and parking details. See you Saturday at 7:15, Mike!" },
];

async function synthesize(text, voiceId) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
        style: 0.15,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '<no body>');
    throw new Error(`ElevenLabs ${res.status}: ${err.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log(`🎙  Generating ${TURNS.length} turns via ElevenLabs (eleven_turbo_v2)...`);
  const chunks = [];
  for (let i = 0; i < TURNS.length; i++) {
    const t = TURNS[i];
    const voice = t.speaker === 'ai' ? AI_VOICE : CALLER_VOICE;
    process.stdout.write(`  ${i + 1}/${TURNS.length} [${t.speaker}] "${t.text.slice(0, 50)}..."`);
    const buf = await synthesize(t.text, voice);
    chunks.push(buf);
    console.log(`  ✓ ${(buf.length / 1024).toFixed(0)} KB`);
  }
  const combined = Buffer.concat(chunks);
  writeFileSync(outPath, combined);
  console.log(`\n✅ Wrote ${outPath} (${(combined.length / 1024).toFixed(0)} KB)`);
  console.log(`   Turn list saved alongside as restaurant-demo.turns.json (used by the iPhone UI HTML)`);

  // Save the turn metadata for the HTML mockup to read
  const meta = {
    turns: TURNS,
    audioFile: 'restaurant-demo.mp3',
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(outPath.replace('.mp3', '.turns.json'), JSON.stringify(meta, null, 2));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
