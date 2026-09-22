import { budgetedModels, budgetedCompletion, compactBrand, retrySeconds } from '@/lib/services/ai/requestBudget'
import { cleanCopy } from '@/lib/services/copyText'
import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'
import Groq from 'groq-sdk'
import { loadGenerationBrandContext, EXTRACTED_CONTEXT_RULES } from '@/lib/services/generationBrandContext'

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
* Never use emojis or emoji number/keycap symbols. Use ordinary numbers and punctuation.
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
Choose the slide count from the amount of useful content, usually 3–10 slides. Do not default to five. A simple idea may need 3; a detailed sequence may need 7–10. Plan one distinct point per content slide and remove filler. Honor an explicit slide count in the brief.
Each slide should have:
* slideNumber
* purpose
* headline
* body
* cta

The first slide is a cover with a short hook and one brief teaser. Use 3–8 words for the headline when possible and never exceed 10 words. Make it instantly understandable, concrete and curiosity-driving without clickbait. Add a 2–14 word body that invites the reader into the carousel without explaining the whole topic. Set its cta to an empty string; put detailed explanations on subsequent slides.
The middle slides should develop the idea logically.
The final slide should summarize the message or provide a natural CTA.
Do not put too much text on a slide.

FIELD DEFINITIONS:

"format": The Instagram format. Allowed values: "single" or "carousel". Must match the Content Brief.

"headline": The main piece of text that should attract attention. Short, clear and easy to understand. For a single post, this is the primary headline on the graphic. For a carousel, the headline on slide 1 should act as the main hook. Avoid making headlines unnecessarily long.

"subheadline": A short sentence that provides context or expands on the headline. Optional when it does not add value. For carousels, leave this empty; the cover contains only its headline.

"supportingText": Short supporting copy that explains or reinforces the main message. Concise enough to appear on a graphic. Do not write a long paragraph.

"cta": A short call to action appropriate to the post. Should feel natural and match the objective. Do not force a sales CTA into educational content.

"slides": An array containing the content of every carousel slide. Use as many slides as the content requires, usually 3–10, without padding or a fixed default.

"slideNumber": The numerical order of the slide. Start at 1.

"purpose": The communication role of the slide. Examples: "hook", "context", "problem", "explanation", "example", "solution", "summary", "cta". Keep it short.

"body": The main explanatory text for the slide. Enough to communicate the idea but concise enough for an Instagram graphic. Avoid large paragraphs. Use short sentences or compact structures.

"caption": The Instagram caption that accompanies the visual. Should expand on the topic, add context not obvious from the graphic, be useful to the audience, match the company's tone, encourage interaction when appropriate, and end with a natural CTA when appropriate. Do not simply copy the slide text. Normally 2–5 short paragraphs.

"hashtags": A small list of relevant hashtags. Approximately 3–8 hashtags. Must be relevant to the company's industry, the topic, and the target audience. Do not use irrelevant trending hashtags.

"visualNotes": Brief notes for the graphic designer explaining important content considerations. NOT a design specification. For explanation-heavy slides (about 55 words or more), recommend a text-led slide without imagery: prioritize compact, clearly separated reading blocks. Images are optional and should add information rather than compete with detailed explanations. Examples: "The statistic should be visually prominent." / "The three steps should be clearly separated." Do not specify coordinates, colors, fonts or node structures.

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
* slides (content-driven slide count, first is hook, last is conclusion/CTA)
* caption
* hashtags
* visualNotes
and return empty strings for headline, subheadline, supportingText and cta.

Return ONLY valid JSON.`
}

async function getGroqModel(groq: Groq): Promise<string> {
  const models = await budgetedModels(groq)
  const preferred = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant']
  const found = preferred.find(id => models.data.some((model: any) => model.id === id && model.active !== false))
  if (!found) throw new Error('No supported copywriting chat model is available in this Groq account. Check your project model permissions.')
  return found
}
export async function handleGenerateCopywriting(body: any, db: any) {
  try {
    const { idea } = body
    const brandContext = await loadGenerationBrandContext(db, body)

    if (!brandContext) {
      return corsify(NextResponse.json({ error: 'brandContext is required' }, { status: 400 }))
    }
    if (!idea) {
      return corsify(NextResponse.json({ error: 'idea (content brief) is required' }, { status: 400 }))
    }

    const apiKey = (process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_2)
    if (!apiKey) {
      return corsify(NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 }))
    }

    const groq = new Groq({ apiKey,maxRetries:0 })
    const model = await getGroqModel(groq)

    const brandJson = JSON.stringify(compactBrand(brandContext))
    const briefJson = JSON.stringify(idea, null, 2)
    const userPrompt = buildUserPrompt(brandJson, briefJson)

    let parsed: any
    let validationFeedback = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: any
      try {
        response = await budgetedCompletion(groq, {
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT + '\n\n' + EXTRACTED_CONTEXT_RULES },
            { role: 'user', content: userPrompt + (attempt ? `\nThe previous attempt failed output validation: ${validationFeedback}. Correct that issue and generate a complete JSON object with the requested fields and no commentary.` : '') },
          ],
          response_format: { type: 'json_object' },
          max_tokens: attempt ? 4800 : 2400,
          temperature: attempt ? 0.2 : 0.7,
        })
      } catch (error: any) {
        const code = error?.error?.error?.code || error?.error?.code || error?.code
        if (attempt === 0 && code === 'json_validate_failed') continue
        throw error
      }
      const choice = response.choices?.[0]
      const raw = choice?.message?.content?.trim() || ''
      try {
        if (choice?.finish_reason === 'length') throw new Error('Truncated copywriting response')
        parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim())
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a copywriting object')
        if (!['single', 'carousel'].includes(parsed.format) || (idea.format && parsed.format !== idea.format)) throw new Error('Incorrect post format')
        if (typeof parsed.caption !== 'string') throw new Error('Missing caption')
        if (parsed.format === 'single' && (typeof parsed.headline !== 'string' || !parsed.headline.trim())) throw new Error('Missing headline')
        if (parsed.format === 'carousel') {
          if (!Array.isArray(parsed.slides) || parsed.slides.length < 2 || parsed.slides.some((slide: any) => !slide || typeof slide.headline !== 'string' || !slide.headline.trim())) throw new Error('Missing carousel slides')
          const cover = parsed.slides[0]
          const coverWords = cover.headline.trim().split(/\s+/u).filter(Boolean).length
          const teaserWords = String(cover.body || '').trim().split(/\s+/u).filter(Boolean).length
          if (coverWords > 10) throw new Error(`Carousel cover has ${coverWords} words; maximum is 10`)
          if (teaserWords < 2 || teaserWords > 14) throw new Error(`Carousel cover teaser must contain 2–14 words; received ${teaserWords}`)
          if (String(cover.cta || '').trim()) throw new Error('Carousel cover CTA must be empty')
        }
        break
      } catch (error: any) {
        validationFeedback = error?.message || 'invalid output'
        if (attempt === 0) continue
        return corsify(NextResponse.json({ error: 'AI could not generate complete, valid copywriting. Please retry; your saved content is unchanged.' }, { status: 502 }))
      }
    }
    return corsify(NextResponse.json(cleanCopy(parsed)))
  } catch (error: any) {
    console.error('Copywriting generation error:', error)
    return corsify(
      NextResponse.json({ error: error.status===429?'AI quota reached. Retry in '+retrySeconds(error)+' seconds. Completed steps are saved.':error.message || 'Failed to generate copywriting' }, { status: error.status===429?429:500,headers:error.status===429?{'Retry-After':String(retrySeconds(error))}:{} })
    )
  }
}
