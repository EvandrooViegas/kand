/**
 * Shared constants for API services
 */

// ───────────────────────────────────────────────────────────────
// AI MODEL CONFIG
// ───────────────────────────────────────────────────────────────

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
export const MODEL_MAIN = 'llama-3.3-70b-versatile'
export const MODEL_FAST = 'llama-3.1-8b-instant'

// ───────────────────────────────────────────────────────────────
// LANGUAGE & TONE CONFIG
// ───────────────────────────────────────────────────────────────

export const LANGUAGE_NAMES: Record<string, string> = {
  english: 'English',
  spanish: 'Spanish',
  french: 'French',
  german: 'German',
  italian: 'Italian',
  portuguese: 'Portuguese',
  dutch: 'Dutch',
  polish: 'Polish',
  swedish: 'Swedish',
  russian: 'Russian',
  japanese: 'Japanese',
  chinese: 'Chinese (Simplified)',
  korean: 'Korean',
  arabic: 'Arabic',
}

export const TONE_DESCS: Record<string, string> = {
  informative:
    'Clear, factual, educational — deliver a useful insight in a calm authoritative way.',
  helpful:
    'Warm, empathetic, solution-focused — talk to the reader like a trusted friend giving real help.',
  aggressive:
    'Bold, urgent, FOMO-driven — challenge the reader, break patterns, create urgency to act NOW.',
  inspiring:
    'Motivational, aspirational, emotional — make the reader feel that change is possible for them.',
  playful:
    'Fun, witty, conversational — light-hearted, a bit surprising, human in every sentence.',
}

// ───────────────────────────────────────────────────────────────
// FALLBACK IDEAS
// ───────────────────────────────────────────────────────────────

export const FALLBACK_IDEAS = [
  'Share a tip your audience does not know yet',
  'Show the story behind how your brand started',
  'Feature a customer success story or testimonial',
  'Give a behind-the-scenes look at your process',
  'Challenge a common misconception in your industry',
  'Highlight your most popular product or service',
  'Share a quick step-by-step how-to',
  'Ask your audience an engaging question',
]

// ───────────────────────────────────────────────────────────────
// FILE SIZE LIMITS
// ───────────────────────────────────────────────────────────────

export const MAX_IMAGE_SIZE = 6 * 1024 * 1024 // 6MB
export const DEFAULT_CANVAS_WIDTH = 1080
export const DEFAULT_CANVAS_HEIGHT = 1080

// ───────────────────────────────────────────────────────────────
// DATABASE LIMITS
// ───────────────────────────────────────────────────────────────

export const DEFAULT_QUERY_LIMIT = 200
export const CAROUSEL_PAGES = 3 // Hook + Content + CTA
