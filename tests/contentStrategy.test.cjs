const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { stripTypeScriptTypes } = require('node:module')
const load = path => stripTypeScriptTypes(fs.readFileSync(path, 'utf8').replace(/^import .*$/gm, '').replace(/export /g, ''))
const strategy = new Function(load('lib/services/contentLanguage.ts') + load('lib/services/contentAngles.ts') + load('lib/services/ideaRequest.ts') + load('lib/services/postImages.ts') + ';return {contentLanguage,languageIssues,copyTexts,chooseAngle,ideaHistory,topicSimilarity,readIdeaRequest,ideaRequestBlock,formatRule,finalFormat,IDEA_REQUEST_RULE,postImageIds,prepareIdeaImages,postImagesBlock}')()
const { contentLanguage, languageIssues, chooseAngle, ideaHistory, topicSimilarity, readIdeaRequest } = strategy
const { EXTRACTED_CONTEXT_RULES } = new Function(load('lib/services/generationBrandContext.ts') + ';return {EXTRACTED_CONTEXT_RULES}')()

// Shaped like a real saved profile: researched in English, brand language Portuguese, Portuguese website.
const brand = {
  id: 'flow-k', name: 'KACHICA', language: 'Portuguese', profileLanguage: 'en', website: 'https://www.kachica.pt/',
  about: 'KACHICA is a digital marketing agency focused on data-driven growth.',
  services: ['Social Media Management — Content creation and engagement.', 'Paid Facebook Ads — Segmented campaigns.', 'Website Development — Conversion-focused sites.', 'AI Automation — Automating repetitive work.'],
  projects: [{ name: 'Barber PH', description: 'Website with booking for a barbershop.' }, { name: 'Prumo Soalheiro', description: 'Digital presence for a construction company.' }],
  differentiators: ['Data-driven results.', 'Dedicated partnership.'],
  contentTopics: ['How AI automation can reduce manual work.', 'Content strategies for TikTok and LinkedIn in construction.'],
  targetAudience: 'Local service businesses', tone: 'Professional', suggestedCtas: ['Contact us'],
}

test('the output language is resolved precisely, including the regional variant', () => {
  assert.equal(contentLanguage(brand).code, 'pt-PT')
  assert.equal(contentLanguage({ language: 'Portuguese', website: 'https://loja.com.br' }).code, 'pt-BR')
  assert.equal(contentLanguage({ language: 'Portuguese', languageVariant: 'pt-BR', website: 'https://x.pt' }).code, 'pt-BR', 'an explicit variant wins')
  assert.equal(contentLanguage({ language: 'English' }).code, 'en-US')
  assert.equal(contentLanguage({}).code, 'en-US')
  assert.match(contentLanguage(brand).rules, /never copy its English sentences/)
  assert.match(contentLanguage(brand).rules, /never "você"/)
})

test('mixed-language copy is detected in code: English leaks and the wrong Portuguese variant', () => {
  const pt = contentLanguage(brand)
  // Real headlines from mixed posts.
  assert.match(languageIssues(['TikTok: sua nova fonte de projetos', 'Métricas de engajamento vs. leads'], pt).join(), /English wording \(leads\)/)
  assert.match(languageIssues(['Com você, a equipe está trabalhando'], pt).join(), /Brazilian Portuguese forms \(você, equipe, está trabalhando\)/)
  assert.match(languageIssues(['Contact us for a discovery consultation and learn how we work with your business'], pt).join(), /English wording/)
  assert.deepEqual(languageIssues(['A sua equipa está a trabalhar connosco', 'Segmentação no Facebook Ads: alcance os clientes certos e melhore o ROI.'], pt), [], 'proper nouns and acronyms are fine')
  assert.deepEqual(languageIssues(['Grow your business with us today'], contentLanguage({ language: 'English' })), [])
})

test('angles rotate through pillars and every part of the brand instead of repeating one subject', () => {
  let history = [], seed = 1
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const angles = []
  for (let i = 0; i < 12; i++) {
    const angle = chooseAngle(brand, history, random)
    angles.push(angle)
    history = [{ topic: angle.facet.label, pillar: angle.pillar, format: angle.format, angle: { pillar: angle.pillar, facet: angle.facet.label } }, ...history]
  }
  assert.ok(new Set(angles.map(a => a.pillar)).size >= 8, 'at least eight different pillars in twelve ideas')
  assert.ok(angles.every((a, i) => !i || a.pillar !== angles[i - 1].pillar), 'never the same pillar twice in a row')
  for (const kind of ['service', 'project', 'differentiator', 'topic', 'company']) assert.ok(angles.some(a => a.facet.kind === kind), `uses a ${kind}`)
  assert.ok(new Set(angles.map(a => a.facet.label)).size >= 10, 'subjects rarely repeat')
  assert.ok(angles.some(a => a.format === 'single') && angles.some(a => a.format === 'carousel'))
})

test('history merges saved and client ideas, and legacy ideas without angles still count by the names they mention', () => {
  const history = ideaHistory([{ topic: 'Segmentação avançada no Facebook Ads', pillar: 'Educational' }], [{ topic: 'Segmentação avançada no Facebook Ads' }, 'Estratégias para TikTok e LinkedIn'])
  assert.equal(history.length, 2)
  const angle = chooseAngle({ ...brand, projects: [], differentiators: [], contentTopics: [], about: '', services: brand.services.slice(0, 2) }, [{ topic: 'Segmentação avançada no Facebook Ads', pillar: 'Services' }], () => 0)
  assert.equal(angle.facet.label, 'Social Media Management', 'the Facebook Ads service is already covered')
  assert.ok(topicSimilarity('Segmentação avançada no Facebook Ads para negócios locais', 'Segmentação avançada no Facebook Ads: alcançar clientes locais') >= .5)
  assert.ok(topicSimilarity('Segmentação avançada no Facebook Ads', 'A metodologia de 4 etapas da KACHICA') < .2)
})

function handler(file, name, outputs, saved = {}) {
  const requests = []
  const budgetedCompletion = async (_client, request) => { requests.push(request); const output = outputs.shift(); return { choices: [{ message: { content: JSON.stringify(output) }, finish_reason: 'stop' }] } }
  const db = { collection: () => ({ findOne: async () => ({ brandContext: brand, ...saved }) }) }
  const loadGenerationBrandContext = async () => ({ ...brand })
  const run = new Function('Groq', 'process', 'loadGenerationBrandContext', 'EXTRACTED_CONTEXT_RULES', 'compactBrand', 'budgetedModels', 'budgetedCompletion', 'NextResponse', 'corsify', 'randomUUID', 'cleanCopy', 'retrySeconds', 'availableGroqCompletion', ...Object.keys(strategy), load(`lib/handlers/${file}.ts`) + `;return ${name}`)(
    class {}, { env: { GROQ_API_KEY: 'test' } }, loadGenerationBrandContext, EXTRACTED_CONTEXT_RULES, x => x,
    async () => ({ data: [{ id: 'llama-3.3-70b-versatile' }] }), budgetedCompletion,
    { json: (body, options) => ({ body, status: options?.status || 200 }) }, r => r, () => 'unique', r => r, () => 60, budgetedCompletion, ...Object.values(strategy),
  )
  return { requests, run: body => run(body, db) }
}

test('an idea is built on a code-chosen angle, sees previous ideas, and a repeated or mixed-language topic is retried once', async () => {
  const previous = [{ topic: 'Segmentação avançada no Facebook Ads para negócios locais', pillar: 'Educational', angle: { pillar: 'Educational', facet: 'Paid Facebook Ads' } }]
  const repeat = { ideas: [{ topic: 'Segmentação avançada no Facebook Ads para negócios locais e ROI', hook: 'Alcance quem importa', coreMessage: 'Segmentar melhora resultados.' }] }
  const fresh = { ideas: [{ topic: 'Como a Prumo Soalheiro ganhou presença digital na construção civil', hook: 'Da obra para o digital', coreMessage: 'Um caso real da KACHICA.' }] }
  const { run, requests } = handler('contentIdeasHandler', 'handleGenerateContentIdeas', [repeat, fresh], { creationState: { ideas: previous } })
  const result = await run({ brandContext: { id: 'flow-k' } })
  assert.equal(result.status, 200)
  assert.equal(requests.length, 2, 'one retry for the repeated topic')
  const prompt = requests[0].messages[1].content
  assert.match(prompt, /ANGLE FOR THIS IDEA \(required\):\n- Pillar: (?!Educational)/, 'not the pillar used last time')
  assert.match(prompt, /PREVIOUS IDEAS[\s\S]*Segmentação avançada no Facebook Ads/)
  assert.match(prompt, /OUTPUT LANGUAGE: Portuguese — European \(pt-PT\)/)
  assert.match(requests[0].messages[0].content, /contentTopics are research suggestions, not a queue/)
  assert.match(requests[1].messages[1].content, /repeats an existing idea/)
  const idea = result.body.ideas[0]
  assert.match(idea.topic, /Prumo Soalheiro/)
  assert.ok(idea.angle?.pillar && idea.angle?.facet, 'the angle is stored with the idea for the next choice')

  const english = { ideas: [{ topic: 'How to get more leads for your business', hook: 'Grow today', coreMessage: 'Learn how we work.' }] }
  const second = handler('contentIdeasHandler', 'handleGenerateContentIdeas', [english, fresh])
  assert.equal((await second.run({ brandContext: { id: 'flow-k' } })).status, 200)
  assert.match(second.requests[1].messages[1].content, /English wording/)
})

test('copy in the wrong language is regenerated once with precise feedback, then accepted rather than failing the post', async () => {
  const mixed = { format: 'single', headline: 'Transforme dados em crescimento', supportingText: 'Contact us and learn how we work with your business.', cta: 'Saiba mais', caption: 'Texto', hashtags: [] }
  const clean = { format: 'single', headline: 'Transforme dados em crescimento', supportingText: 'Fale connosco e veja como trabalhamos com o seu negócio.', cta: 'Saiba mais', caption: 'Texto', hashtags: [] }
  const { run, requests } = handler('copywritingHandler', 'handleGenerateCopywriting', [mixed, clean])
  const result = await run({ brandContext: { id: 'flow-k' }, idea: { format: 'single', topic: 'Dados' } })
  assert.equal(result.status, 200)
  assert.equal(requests.length, 2)
  assert.match(requests[1].messages[1].content, /Language: the copy contains English wording/)
  assert.match(requests[0].messages[0].content, /OUTPUT LANGUAGE: Portuguese — European \(pt-PT\)/)
  assert.match(requests[0].messages[1].content, /English research notes: use them for facts only/)
  assert.equal(result.body.supportingText, clean.supportingText)

  const stubborn = handler('copywritingHandler', 'handleGenerateCopywriting', [mixed, mixed])
  assert.equal((await stubborn.run({ brandContext: { id: 'flow-k' }, idea: { format: 'single', topic: 'Dados' } })).status, 200, 'a trace of English never blocks the post')
})

test('nothing on an Instagram graphic is clickable: button CTAs are removed in code, Instagram actions are kept', async () => {
  const slides = cta => [
    { slideNumber: 1, purpose: 'hook', headline: 'Dados sem decisões', body: 'Veja porquê.', cta: '' },
    { slideNumber: 2, purpose: 'explanation', headline: 'Meça o que importa', body: 'Três números chegam para começar.', cta: '' },
    { slideNumber: 3, purpose: 'summary', headline: 'Comece pelo essencial', body: 'Escolha um número esta semana.', cta },
  ]
  const run = async cta => {
    const output = { format: 'carousel', headline: '', subheadline: '', supportingText: '', cta: '', slides: slides(cta), caption: 'Texto', hashtags: [] }
    const { run } = handler('copywritingHandler', 'handleGenerateCopywriting', [output, output])
    return (await run({ brandContext: { id: 'flow-k' }, idea: { format: 'carousel', topic: 'Dados' } })).body.slides.at(-1).cta
  }
  assert.equal(await run('Saiba mais'), '')
  assert.equal(await run('Explore more'), '')
  assert.equal(await run('Clique aqui e descubra'), '')
  assert.equal(await run('Envie-nos uma mensagem'), 'Envie-nos uma mensagem')
  assert.equal(await run('Saiba mais pelo link na bio'), 'Saiba mais pelo link na bio')
})

test('a typed idea is cleaned and capped, and an unknown format falls back to auto', () => {
  assert.deepEqual(readIdeaRequest({ userIdea: '  Antes e depois\n\n de uma   reabilitação  ', format: 'carousel' }), { request: 'Antes e depois de uma reabilitação', format: 'carousel' })
  assert.deepEqual(readIdeaRequest({ userIdea: 42, format: 'reel' }), { request: '', format: 'auto' })
  assert.equal(readIdeaRequest({ userIdea: 'x'.repeat(900) }).request.length, 600)
})

test('a typed idea becomes the subject of the brief, grounded in the brand, and is never rejected as a repeat', async () => {
  const previous = [{ topic: 'Como a Prumo Soalheiro ganhou presença digital na construção civil', pillar: 'Projects / Cases' }]
  const brief = { ideas: [{ topic: 'Antes e depois: a presença digital da Prumo Soalheiro', hook: 'Da obra para o digital', coreMessage: 'Um caso real da KACHICA.', format: 'single' }] }
  const { run, requests } = handler('contentIdeasHandler', 'handleGenerateContentIdeas', [brief], { creationState: { ideas: previous } })
  const result = await run({ brandContext: { id: 'flow-k' }, userIdea: 'Before and after of the Prumo Soalheiro project', format: 'carousel' })
  assert.equal(result.status, 200)
  assert.equal(requests.length, 1, 'revisiting a subject on request is not retried as a repeat')
  const [system, user] = requests[0].messages.map(m => m.content)
  assert.match(user, /THE USER'S IDEA[\s\S]*Before and after of the Prumo Soalheiro project/)
  assert.match(user, /BRAND INFORMATION/)
  assert.match(user, /- Format: carousel \(required: the user chose it\)/)
  assert.doesNotMatch(user, /ANGLE FOR THIS IDEA|PREVIOUS IDEAS/, 'no code-chosen angle overrides the user')
  assert.match(user, /OUTPUT LANGUAGE: Portuguese — European \(pt-PT\)/, 'written in the brand language whatever the idea language')
  assert.match(system, /facts the user states about their own company may be used as stated/)
  const idea = result.body.ideas[0]
  assert.equal(idea.userRequest, 'Before and after of the Prumo Soalheiro project', 'the request travels to the copywriter')
  assert.equal(idea.format, 'carousel', 'the chosen format wins over the model')
  assert.equal(idea.angle, undefined)
})

test('a suggestion keeps its angle and honours a chosen format', async () => {
  const brief = { ideas: [{ topic: 'Como a automação com IA reduz tarefas manuais', hook: 'Menos tarefas', coreMessage: 'A IA liberta tempo.', format: 'carousel' }] }
  const { run, requests } = handler('contentIdeasHandler', 'handleGenerateContentIdeas', [brief])
  const result = await run({ brandContext: { id: 'flow-k' }, userIdea: '   ', format: 'single' })
  assert.equal(result.status, 200)
  assert.match(requests[0].messages[1].content, /ANGLE FOR THIS IDEA \(required\)[\s\S]*- Format: single \(required: the user chose it\)/)
  assert.equal(result.body.ideas[0].format, 'single')
  assert.equal(result.body.ideas[0].userRequest, undefined)
  assert.ok(result.body.ideas[0].angle)
})
