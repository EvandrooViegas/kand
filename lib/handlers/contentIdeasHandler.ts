import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'
import Groq from 'groq-sdk'

const SYSTEM_PROMPT = `You are an expert Instagram content strategist.

Your job is to analyze a company's brand information and create relevant Instagram post ideas that are aligned with the company's positioning, audience, services, expertise, and visual identity.

You are NOT creating the final Instagram post yet.

You are creating structured CONTENT BRIEFS that will later be given to another AI responsible for writing the post and another AI responsible for designing the visual.

IMPORTANT RULES:

* Use ONLY information available in the provided brand information.
* Never invent services, clients, statistics, awards, certifications, results, locations, products, or company facts.
* Do not make unsupported claims.
* Do not create ideas that have no connection to the company.
* Avoid generic content that could apply to any business.
* Ideas should provide value to the company's target audience.
* Ideas should help the company build authority, trust, awareness, engagement, or generate interest in its services.
* Use the company's actual positioning and differentiators whenever possible.
* If the brand language is Portuguese and the variant is pt-PT, write the content idea in European Portuguese.
* Avoid excessive promotional content.
* Create a balanced content strategy rather than making every post an advertisement.

CONTENT PILLARS:

Use one of the following pillars whenever possible:

* Educational: Teach the audience something relevant to the company's industry.
* Expertise: Demonstrate the company's knowledge, experience, methodology, or way of working.
* Services: Explain a service, what problem it solves, or when someone might need it.
* Projects / Cases: Showcase real projects, work, processes, or results when information about them is available.
* Company: Communicate the company's identity, values, mission, team, culture, or story.
* Behind the scenes: Show how the company works, its processes, people, equipment, or day-to-day operations when information is available.
* Industry insights: Discuss relevant trends, changes, challenges, or opportunities in the company's industry.
* Problems and solutions: Identify a problem faced by the target audience and explain how it can be approached or solved.
* Trust / Credibility: Communicate information that helps the audience understand why the company is trustworthy.
* Brand positioning: Communicate what makes the company different and how it approaches its work.

FIELD DEFINITIONS:

For every idea, return the following fields:

"id": A unique identifier. Use format "idea-001", "idea-002", etc.

"pillar": The main content category. Choose from the pillars listed above.

"objective": WHY the company should publish this post. Describe the desired communication or marketing objective.

"format": "single" for one visual, "carousel" for multiple slides. Use "carousel" when the topic requires explanation, steps, lists, comparisons, storytelling, or multiple pieces of information. Use "single" when one strong message suffices.

"topic": The specific subject of the post. Must be specific enough that another AI can write the complete post without guessing.

"hook": The main attention-grabbing statement. Must be clear, create curiosity, address a relevant problem or question, and avoid clickbait.

"coreMessage": The ONE main idea the audience should understand after seeing the post. 1-3 sentences. Do not write the full post here.

"targetAudience": Who this specific post is for. Be specific.

"visualDirection": How the content could be visually communicated. Describe the visual approach type, not exact positions or dimensions.

CONTENT QUALITY — before returning each idea verify:
1. Is this relevant to the company's business?
2. Is this relevant to its target audience?
3. Does it provide value?
4. Does it reinforce the company's positioning?
5. Could another AI create a complete post from this brief without guessing?
6. Is the idea sufficiently specific?
7. Is it based on information actually available about the company?

Return ONLY valid JSON. Do not return Markdown. Do not return explanations. Do not return text outside the JSON object.`

function buildUserPrompt(brandJson: string): string {
  return `Analyze the following extracted brand information and generate 10 Instagram content ideas.

BRAND INFORMATION:

${brandJson}

For every idea, follow the exact structure defined in the system instructions.

Create a balanced mix of content pillars and formats.

Prioritize ideas that:

* Demonstrate the company's expertise
* Educate its target audience
* Explain problems the company can solve
* Communicate its differentiators
* Create trust
* Naturally connect with the company's services

Do not make every idea directly promotional.

Return exactly this JSON structure:

{
  "ideas": [
    {
      "id": "idea-001",
      "pillar": "Educational",
      "objective": "Educate potential clients about an important problem",
      "format": "carousel",
      "topic": "Specific topic of the post",
      "hook": "Attention-grabbing opening statement",
      "coreMessage": "The main idea the audience should understand",
      "targetAudience": "Specific audience for this post",
      "visualDirection": "Suggested visual approach"
    }
  ]
}`
}

export async function handleGenerateContentIdeas(body: any) {
  try {
    const { brandContext } = body

    if (!brandContext) {
      return corsify(
        NextResponse.json({ error: 'brandContext is required' }, { status: 400 })
      )
    }

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
      return corsify(
        NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 })
      )
    }

    const groq = new Groq({ apiKey })

    // Use the same model selection strategy as the business info extractor
    let model = 'groq/compound-mini'
    try {
      const models = await groq.models.list()
      const preferred = ['groq/compound-mini', 'mixtral-8x7b-32768', 'llama-3-70b-versatile']
      const found = preferred.find(p => models.data.some((m: any) => m.id === p))
      if (found) model = found
      else if (models.data.length > 0) model = models.data[0].id
    } catch {
      // stick with default
    }

    const brandJson = JSON.stringify(brandContext, null, 2)
    const userPrompt = buildUserPrompt(brandJson)

    const response = await groq.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8000,
      temperature: 0.7,
    })

    const raw = response.choices[0]?.message?.content?.trim()
    if (!raw) {
      return corsify(
        NextResponse.json({ error: 'Empty response from AI' }, { status: 500 })
      )
    }

    // Strip markdown code fences if the model wrapped the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Response was truncated — try to salvage complete ideas from the partial JSON.
      // Find the last complete idea object (ends with "}" before the truncation point).
      try {
        const ideasStart = cleaned.indexOf('"ideas"')
        const arrayStart = cleaned.indexOf('[', ideasStart)
        if (arrayStart !== -1) {
          // Walk backwards from the end to find the last complete "}" at depth 1
          let depth = 0
          let lastCompleteEnd = -1
          for (let i = arrayStart; i < cleaned.length; i++) {
            if (cleaned[i] === '{') depth++
            if (cleaned[i] === '}') {
              depth--
              if (depth === 0) lastCompleteEnd = i
            }
          }
          if (lastCompleteEnd !== -1) {
            const repairedStr = `{"ideas": ${cleaned.slice(arrayStart, lastCompleteEnd + 1)}]}`
            parsed = JSON.parse(repairedStr)
            console.warn(`Truncated response repaired — recovered ${parsed.ideas?.length ?? 0} ideas`)
          }
        }
      } catch {
        // repair also failed
      }

      if (!parsed) {
        console.error('Failed to parse AI response:', cleaned.slice(0, 500))
        return corsify(
          NextResponse.json({ error: 'AI returned invalid JSON', raw: cleaned }, { status: 500 })
        )
      }
    }

    return corsify(NextResponse.json(parsed))
  } catch (error: any) {
    console.error('Content ideas generation error:', error)
    return corsify(
      NextResponse.json(
        { error: error.message || 'Failed to generate content ideas' },
        { status: 500 }
      )
    )
  }
}
