export interface LMConfig {
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  concurrency: number;
  reoonApiKey: string;
  reoonMode: "quick" | "power";
  anthropicApiKey: string;
  cloudApiKey: string;
  // Multi-provider round-robin keys
  groqKey: string;       // Groq API key (gsk_...)
  geminiKey: string;     // Google Gemini key (AIza...)
  geminiModel: string;   // e.g. gemini-flash-latest
  localUrl: string;      // Local LM Studio URL
  localModel: string;    // Local model name
  // Phase 3: Tiered model providers
  deepseekKey: string;   // DeepSeek API key (sk-...)
  openrouterKey: string; // OpenRouter API key
}

export type CloudProvider = "groq" | "together" | "openrouter" | "local";

export const CLOUD_PRESETS: Record<string, { baseUrl: string; label: string; freeModel: string; note: string }> = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    label: "🔵 Google Gemini (FREE)",
    freeModel: "gemini-1.5-flash",
    note: "Free 15 RPM / 1500 req/day. Get key at ai.google.dev → Get API Key",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    label: "🟢 Groq (FREE)",
    freeModel: "llama-3.3-70b-versatile",
    note: "Free 14,400 req/day. Get key at console.groq.com",
  },
  together: {
    baseUrl: "https://api.together.xyz/v1",
    label: "💙 Together AI",
    freeModel: "meta-llama/Llama-3-70b-chat-hf",
    note: "Cheap pay-per-use. console.together.ai",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    label: "🔀 OpenRouter",
    freeModel: "meta-llama/llama-3.3-70b-instruct:free",
    note: "Many free models. openrouter.ai",
  },
};

export const DEFAULT_LM_CONFIG: LMConfig = {
  baseUrl: "https://api.groq.com/openai/v1",
  model: "llama-3.3-70b-versatile",
  temperature: 0.72,
  maxTokens: 400,
  concurrency: 3,
  reoonApiKey: process.env.NEXT_PUBLIC_REOON_API_KEY || process.env.REOON_API_KEY || "",
  reoonMode: "power",
  anthropicApiKey: "",
  cloudApiKey: "",
  groqKey: "",
  geminiKey: "AIzaSyD9sAav_GM-P2eGmwgH3KZc8UabXHvfBSM",
  geminiModel: "gemini-flash-latest",
  localUrl: "http://192.168.4.59:1234/v1",
  localModel: "google/gemma-4-e4b",
  deepseekKey: "",
  openrouterKey: "",
};

export function isClaudeModel(model: string): boolean {
  return model.startsWith("claude");
}

export type ServiceType = "voice_ai" | "digital_marketing" | "bundle" | "outscraper_voice_ai" | "outscraper_professional" | "leadrocks_voice_ai" | "apollo_voice_ai" | "custom";
export type EmailMode = "icebreaker" | "full_email" | "sequence";

export interface SemanticField {
  key: string;
  label: string;
  description: string;
  example: string;
}

export const SEMANTIC_FIELDS: SemanticField[] = [
  // Standard contact fields
  { key: "firstName",      label: "First Name",          description: "Contact's first name",                    example: "Sarah" },
  { key: "lastName",       label: "Last Name",            description: "Contact's last name",                     example: "Johnson" },
  { key: "fullName",       label: "Full Name",            description: "Full name if no split",                   example: "Sarah Johnson" },
  { key: "ownerName",      label: "Owner Name",           description: "Business owner/contact name (Outscraper)", example: "Howard P Cohen" },
  { key: "company",        label: "Company / Restaurant", description: "Business name",                           example: "Rusty Bellies Waterfront Grill" },
  { key: "jobTitle",       label: "Job Title",            description: "Role / position",                         example: "Owner" },
  { key: "industry",       label: "Industry / Type",      description: "Business type",                           example: "Seafood restaurant" },
  { key: "subtypes",       label: "Subtypes",             description: "All restaurant types (Outscraper)",       example: "Seafood restaurant, Bar, Restaurant" },
  // Location
  { key: "city",           label: "City",                 description: "City",                                    example: "Tarpon Springs" },
  { key: "state",          label: "State",                description: "State/region code",                       example: "FL" },
  { key: "country",        label: "Country",              description: "Country",                                 example: "USA" },
  // Contact
  { key: "email",          label: "Email",                description: "Email address",                           example: "owner@restaurant.com" },
  { key: "phone",          label: "Phone",                description: "Phone number",                            example: "+1 727-934-4047" },
  { key: "website",        label: "Website",              description: "Website URL",                             example: "rustybellies.com" },
  // Review signals
  { key: "rating",         label: "Rating",               description: "Star rating",                             example: "4.6" },
  { key: "reviews",        label: "Review Count",         description: "Total reviews",                           example: "11596" },
  { key: "reviewsTop",     label: "5-Star Reviews",       description: "Count of 5-star reviews (Outscraper)",    example: "8845" },
  { key: "reviewsBottom",  label: "1-Star Reviews",       description: "Count of 1-star reviews (Outscraper)",    example: "255" },
  // Outscraper-specific
  { key: "hours",          label: "Hours",                description: "Operating hours",                         example: "Mon-Thu 11AM-9PM, Fri-Sat 11AM-10PM" },
  { key: "happyHours",     label: "Happy Hours",          description: "Happy hour data (Outscraper other_hours)", example: "Tue-Sun 3-6 PM" },
  { key: "reservationLinks", label: "Reservation Links",  description: "Online booking link (empty = no system)", example: "https://resy.com/..." },
  { key: "attributes",     label: "About / Attributes",   description: "Google attributes JSON (Outscraper)",     example: '{"Live music": true, ...}' },
  { key: "priceRange",     label: "Price Range",          description: "Price tier ($ to $$$$)",                  example: "$$" },
  { key: "foundedYear",    label: "Founded Year",         description: "Year business was founded",               example: "2003" },
  { key: "revenue",        label: "Revenue",              description: "Estimated annual revenue",                example: "50000000" },
  { key: "cuisine",        label: "Cuisine / Niche",      description: "Food type or business niche",             example: "Seafood" },
  // LinkedIn / enrichment
  { key: "linkedinUrl",    label: "LinkedIn URL",         description: "LinkedIn profile URL",                    example: "linkedin.com/in/owner" },
  { key: "linkedinBio",    label: "LinkedIn Bio / Desc",  description: "Bio, LinkedIn summary, or description",   example: "Family-owned waterfront seafood..." },
  { key: "localHook",      label: "Local Hook",           description: "Local news, event, trigger",              example: "Tampa Bay hosted Super Bowl" },
  // Overflow
  { key: "custom1",        label: "Custom 1",             description: "Extra personalization field",             example: "..." },
  { key: "custom2",        label: "Custom 2",             description: "Extra personalization field",             example: "..." },
  { key: "custom3",        label: "Custom 3",             description: "Extra personalization field",             example: "..." },
];

export interface FieldMapping {
  csvColumn: string;
  semanticKey: string;
}

export interface CsvRow {
  [key: string]: string;
}

export interface GeneratedEmail {
  rowIndex: number;
  // Day 0 — initial outreach
  subject: string;
  body: string;
  raw: string;
  // Day 3 — social proof follow-up
  subject2?: string;
  body2?: string;
  // Day 7 — curiosity / question
  subject3?: string;
  body3?: string;
  // Day 14 — break-up / re-engagement
  subject4?: string;
  body4?: string;
  error?: string;
  edited?: boolean;
  icebreaker?: string;
}

export interface GenerationState {
  status: "idle" | "running" | "paused" | "done" | "error";
  total: number;
  done: number;
  failed: number;
  currentBatch: number[];
  emails: GeneratedEmail[];
  startedAt?: number;
}

// ReachInbox sequence day delays
export const SEQUENCE_DELAYS = { step2: 3, step3: 7, step4: 14 };

export interface SequenceTemplates {
  step1: string;
  step2: string;
  step3: string;
  step4: string;
  systemPrompt: string;
  mode: EmailMode;
  service: ServiceType;
}
