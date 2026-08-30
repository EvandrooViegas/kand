import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'
import Groq from 'groq-sdk'

const SYSTEM_PROMPT = `You are an expert Instagram copywriter specialized in creating high-quality social media content for businesses.

Your job is to transform a structured Instagram Content Brief into the complete written content for an Instagram post.

You will receive:

1. The company's Brand Profile
2. A Content Brief created by a content strategist

Your output will later be given to a separate AI graphic designer that will transform the written content into a KAND Canvas design.

Therefore, your job is ONLY to write the content.

Do NOT design the post.
Do NOT describe the visual layout.
Do NOT create Canvas JSON.
Do NOT invent images.
Do NOT include design instructions inside the copy.

IMPORTANT RULES:

* Use ONLY information provided in the Brand Profile and Content Brief.
* Never invent facts, statistics, clients, awards, certifications, results, services, products or company history.
* Never make claims that cannot be supported by the provided information.
* Follow the company's language and language variant.
* If the language is Portuguese (pt-PT), use European Portuguese.
* Match the company's positioning and tone.
* Write naturally and humanly.
* Avoid generic AI-sounding phrases.
* Avoid exaggerated marketing language.
* Avoid clickbait.
* Avoid unnecessary emojis.
* Avoid excessive use of exclamation marks.
* Avoid repetitive phrases.
* Avoid unnecessarily complicated language.
* Keep visual copy concise because it will be displayed on an Instagram graphic.
* The caption can contain more context than the visual.
* The visual and caption should communicate the same central idea without simply duplicating each other.

CONTENT STRUCTURE:

For a SINGLE post:
Create:
* headline
* subheadline
* supportingText
* cta

For a CAROUSEL:
Create 5–7 slides.
Each slide should have:
* slideNumber
* purpose
* headline
* body
* cta

The first slide must work as the hook/cover.
The middle slides should develop the idea logically.
The final slide should summarize the message or provide a natural CTA.
Do not put too much text on a slide.

FIELD DEFINITIONS:

"format": The Instagram format. Allowed values: "single" or "carousel". Must match the Content Brief.

"headline": The main piece of text that should attract attention. Short, clear and easy to understand. For a single post, this is the primary headline on the graphic. For a carousel, the headline on slide 1 should act as the main hook. Avoid making headlines unnecessarily long.

"subheadline": A short sentence that provides context or expands on the headline. Optional when it does not add value. For carousel posts, use it primarily on the cover slide.

"supportingText": Short supporting copy that explains or reinforces the main message. Concise enough to appear on a graphic. Do not write a long paragraph.

"cta": A short call to action appropriate to the post. Should feel natural and match the objective. Do not force a sales CTA into educational content.

"slides": An array containing the content of every carousel slide. Use between 5 and 7 slides.

"slideNumber": The numerical order of the slide. Start at 1.

"purpose": The communication role of the slide. Examples: "hook", "context", "problem", "explanation", "example", "solution", "summary", "cta". Keep it short.

"body": The main explanatory text for the slide. Enough to communicate the idea but concise enough for an Instagram graphic. Avoid large paragraphs. Use short sentences or compact structures.

"caption": The Instagram caption that accompanies the visual. Should expand on the topic, add context not obvious from the graphic, be useful to the audience, match the company's tone, encourage interaction when appropriate, and end with a natural CTA when appropriate. Do not simply copy the slide text. Normally 2–5 short paragraphs.

"hashtags": A small list of relevant hashtags. Approximately 3–8 hashtags. Must be relevant to the company's industry, the topic, and the target audience. Do not use irrelevant trending hashtags.

"visualNotes": Brief notes for the graphic designer explaining important content considerations. NOT a design specification. Only use when something about the content needs special visual treatment. Examples: "The statistic should be visually prominent." / "The three steps should be clearly separated." Do not specify coordinates, colors, fonts or node structures.

QUALITY CONTROL — before returning verify:
1. Is the content directly related to the Content Brief?
2. Does it match the brand?
3. Is every factual claim supported?
4. Is the hook strong without being clickbait?
5. Is the visual copy concise?
6. Does every carousel slide have a clear purpose?
7. Does the carousel tell a logical story?
8. Does the caption add value instead of repeating the graphic?
9. Is the CTA appropriate?
10. Is the language correct for the brand's language variant?

Return ONLY valid JSON. Do not return Markdown. Do not return explanations. Do not return text outside the JSON.`

function buildUserPrompt(brandJson: string, briefJson: string): string {
  return `Create the complete written content for the Instagram post using the following information.

BRAND PROFILE:

${brandJson}

CONTENT BRIEF:

${briefJson}

Follow all rules from the system instructions.

Return exactly this structure:

{
  "format": "single",
  "headline": "",
  "subheadline": "",
  "supportingText": "",
  "cta": "",
  "slides": [],
  "caption": "",
  "hashtags": [],
  "visualNotes": []
}

If the format is "single", populate:
* headline
* subheadline
* supportingText
* cta
* caption
* hashtags
* visualNotes
and return an empty "slides" array.

If the format is "carousel", populate:
* slides (between 5 and 7 slides, first is hook, last is conclusion/CTA)
* caption
* hashtags
* visualNotes
and return empty strings for headline, subheadline, supportingText and cta.

Return ONLY valid JSON.`
}

async function getGroqModel(groq: Groq): Promise<string> {
  try {
    const models = await groq.models.list()
    const preferred = ['groq/compound-mini', 'mixtral-8x7b-32768', 'llama-3-70b-versatile']
    const found = preferred.find(p => models.data.some((m: any) => m.id === p))
    if (found) return found
    if (models.data.length > 0) return models.data[0].id
  } catch {
    // fall through to default
  }
  return 'groq/compound-mini'
}

export async function handleGenerateCopywriting(body: any) {
  try {
    const { brandContext, idea } = body

    if (!brandContext) {
      return corsify(NextResponse.json({ error: 'brandContext is required' }, { status: 400 }))
    }
    if (!idea) {
      return corsify(NextResponse.json({ error: 'idea (content brief) is required' }, { status: 400 }))
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return corsify(NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 }))
    }

    const groq = new Groq({ apiKey })
    const model = await getGroqModel(groq)

    const brandJson = JSON.stringify(brandContext, null, 2)
    const briefJson = JSON.stringify(idea, null, 2)
    const userPrompt = buildUserPrompt(brandJson, briefJson)

    // Retry up to 3 times on rate limit (429)
    let raw: string | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 4000,
          temperature: 0.7,
        })
        raw = response.choices[0]?.message?.content?.trim() ?? null
        break
      } catch (err: any) {
        const is429 = err?.status === 429 || err?.message?.includes('rate_limit_exceeded')
        if (is429 && attempt < 2) {
          console.warn(`Rate limited on copywriting attempt ${attempt + 1}, retrying in 15s…`)
          await new Promise(r => setTimeout(r, 15000))
          continue
        }
        throw err
      }
    }

    if (!raw) {
      return corsify(NextResponse.json({ error: 'Empty response from AI' }, { status: 500 }))
    }

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('Failed to parse copywriting AI response:', cleaned)
      return corsify(NextResponse.json({ error: 'AI returned invalid JSON', raw: cleaned }, { status: 500 }))
    }

    return corsify(NextResponse.json(parsed))
  } catch (error: any) {
    console.error('Copywriting generation error:', error)
    return corsify(
      NextResponse.json({ error: error.message || 'Failed to generate copywriting' }, { status: 500 })
    )
  }
}
