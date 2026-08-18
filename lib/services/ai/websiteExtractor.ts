/**
 * Business / Brand Intelligence Extraction
 *
 * Extracts:
 * - Business identity
 * - Target audience
 * - Services
 * - About / mission / value proposition
 * - Brand personality
 * - Tone of voice
 * - Content themes
 * - Colors
 * - Fonts
 * - Website structure
 * - Social links
 * - Contact information
 * - Schema.org / JSON-LD information
 *
 * Uses deterministic extraction first and AI second.
 */

import * as cheerio from 'cheerio'
import { callGroq, extractJson } from './groqClient'

/* =========================================================
   TYPES
========================================================= */

export interface BusinessInfo {
  // Keep these fields for your existing UI
  name: string
  targetAudience: string
  services: string
  about: string

  designSystem: {
    colors: {
      primary: string
      secondary: string
      accent: string
      background: string
      text: string
      additional: string[]
    }

    fonts: {
      heading: string
      body: string
      additional: string[]
    }

    visualStyle: string
    layoutStyle: string
    buttonStyle: string
    imageryStyle: string
  }

  // New brand intelligence
  identity: {
    tagline: string
    industry: string
    businessType: string
    location: string
    website: string
  }

  audience: {
    primary: string
    secondary: string
    demographics: string
    needs: string[]
    painPoints: string[]
  }

  business: {
    mission: string
    valueProposition: string
    differentiators: string[]
    servicesList: string[]
    products: string[]
  }

  brand: {
    personality: string[]
    toneOfVoice: string[]
    keywords: string[]
    contentThemes: string[]
    callsToAction: string[]
  }

  website: {
    pages: string[]
    headings: string[]
    navigation: string[]
    socialLinks: string[]
    contact: {
      email: string
      phone: string
      address: string
    }
  }
}

interface WebsiteData {
  url: string
  html: string
  css: string

  metadata: {
    title: string
    description: string
    keywords: string
    ogTitle: string
    ogDescription: string
    ogImage: string
    canonical: string
  }

  headings: string[]
  paragraphs: string[]
  navigation: string[]
  buttons: string[]

  links: Array<{
    text: string
    href: string
  }>

  images: Array<{
    alt: string
    src: string
  }>

  structuredData: any[]

  colors: Array<{
    value: string
    occurrences: number
    contexts: string[]
  }>

  fonts: Array<{
    family: string
    selectors: string[]
  }>
}

/* =========================================================
   MAIN FUNCTION
========================================================= */

export async function extractBusinessInfoFromWebsite(
  url: string
): Promise<BusinessInfo> {
  try {
    const normalizedUrl = normalizeUrl(url)

    console.log(`Starting business extraction: ${normalizedUrl}`)

    /*
     * STEP 1
     * Fetch HTML + external CSS
     */
    const { html, css } = await fetchWebsite(normalizedUrl)

    /*
     * STEP 2
     * Extract structured information from the website
     */
    const websiteData = extractWebsiteData(
      html,
      css,
      normalizedUrl
    )

    console.log('Website data extracted:', {
      headings: websiteData.headings.length,
      paragraphs: websiteData.paragraphs.length,
      links: websiteData.links.length,
      images: websiteData.images.length,
      colors: websiteData.colors.length,
      fonts: websiteData.fonts.length,
      structuredData: websiteData.structuredData.length,
    })

    /*
     * STEP 3
     * Ask AI to understand the business
     */
    const result = await extractWithAI(websiteData)

    /*
     * STEP 4
     * Validate / clean result
     */
    return normalizeBusinessInfo(result, websiteData)
  } catch (error) {
    console.error(
      'Business extraction failed:',
      error
    )

    return createFallbackBusinessInfo(url)
  }
}

/* =========================================================
   URL
========================================================= */

function normalizeUrl(url: string): string {
  let normalized = url.trim()

  if (
    !normalized.startsWith('http://') &&
    !normalized.startsWith('https://')
  ) {
    normalized = `https://${normalized}`
  }

  return normalized.replace(/\/$/, '')
}

/* =========================================================
   FETCH WEBSITE
========================================================= */

async function fetchWebsite(
  url: string
): Promise<{
  html: string
  css: string
}> {
  const controller = new AbortController()

  const timeoutId = setTimeout(() => {
    controller.abort()
  }, 30000)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(
        `Website returned ${response.status}: ${response.statusText}`
      )
    }

    const html = await response.text()

    /*
     * Extract external CSS URLs
     */
    const $ = cheerio.load(html)

    const stylesheetUrls: string[] = []

    $('link[rel="stylesheet"]').each((_, element) => {
      const href = $(element).attr('href')

      if (!href) return

      try {
        const absoluteUrl = new URL(
          href,
          url
        ).toString()

        stylesheetUrls.push(absoluteUrl)
      } catch {
        // Ignore invalid URLs
      }
    })

    /*
     * Download external CSS
     */
    const cssResults = await Promise.allSettled(
      stylesheetUrls.slice(0, 10).map(async (cssUrl) => {
        try {
          const cssResponse = await fetch(cssUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 Chrome/131 Safari/537.36',
            },
          })

          if (!cssResponse.ok) {
            return ''
          }

          return await cssResponse.text()
        } catch {
          return ''
        }
      })
    )

    const externalCss = cssResults
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<string> =>
          result.status === 'fulfilled'
      )
      .map((result) => result.value)
      .join('\n')

    /*
     * Also include inline CSS
     */
    const inlineCss = $('style')
      .map((_, element) => $(element).html() || '')
      .get()
      .join('\n')

    return {
      html,
      css: `${inlineCss}\n${externalCss}`,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/* =========================================================
   WEBSITE EXTRACTION
========================================================= */

function extractWebsiteData(
  html: string,
  css: string,
  url: string
): WebsiteData {
  const $ = cheerio.load(html)

  /* -------------------------
     Metadata
  ------------------------- */

  const metadata = {
    title: $('title').text().trim(),

    description:
      $('meta[name="description"]')
        .attr('content')
        ?.trim() || '',

    keywords:
      $('meta[name="keywords"]')
        .attr('content')
        ?.trim() || '',

    ogTitle:
      $('meta[property="og:title"]')
        .attr('content')
        ?.trim() || '',

    ogDescription:
      $('meta[property="og:description"]')
        .attr('content')
        ?.trim() || '',

    ogImage:
      $('meta[property="og:image"]')
        .attr('content')
        ?.trim() || '',

    canonical:
      $('link[rel="canonical"]')
        .attr('href')
        ?.trim() || url,
  }

  /* -------------------------
     Headings
  ------------------------- */

  const headings = unique(
    $('h1, h2, h3, h4, h5, h6')
      .map((_, element) =>
        cleanText($(element).text())
      )
      .get()
      .filter(Boolean)
  )

  /* -------------------------
     Paragraphs
  ------------------------- */

  const paragraphs = unique(
    $('p')
      .map((_, element) =>
        cleanText($(element).text())
      )
      .get()
      .filter((text) => text.length >= 20)
  )

  /* -------------------------
     Navigation
  ------------------------- */

  const navigation = unique(
    $('nav a, header a')
      .map((_, element) =>
        cleanText($(element).text())
      )
      .get()
      .filter((text) => text.length > 1)
  )

  /* -------------------------
     Buttons / CTAs
  ------------------------- */

  const buttons = unique(
    $('button, a.btn, a.button, a[class*="btn"], a[class*="button"]')
      .map((_, element) =>
        cleanText($(element).text())
      )
      .get()
      .filter((text) => text.length > 1)
  )

  /* -------------------------
     Links
  ------------------------- */

  const links = $('a[href]')
    .map((_, element) => ({
      text: cleanText($(element).text()),
      href: $(element).attr('href') || '',
    }))
    .get()
    .filter((link) => link.href)

  /* -------------------------
     Images
  ------------------------- */

  const images = $('img')
    .map((_, element) => ({
      alt:
        $(element)
          .attr('alt')
          ?.trim() || '',

      src:
        $(element)
          .attr('src')
          ?.trim() || '',
    }))
    .get()
    .filter(
      (image) =>
        image.alt.length > 0 ||
        image.src.length > 0
    )
    .slice(0, 100)

  /* -------------------------
     Schema.org / JSON-LD
  ------------------------- */

  const structuredData =
    extractStructuredData($)

  /* -------------------------
     CSS
  ------------------------- */

  const { colors, fonts } =
    extractDesignEvidence(css)

  return {
    url,
    html,
    css,

    metadata,

    headings,
    paragraphs,
    navigation,
    buttons,

    links,
    images,

    structuredData,

    colors,
    fonts,
  }
}

/* =========================================================
   JSON-LD
========================================================= */

function extractStructuredData(
  $: cheerio.CheerioAPI
): any[] {
  const result: any[] = []

  $('script[type="application/ld+json"]').each(
    (_, element) => {
      try {
        const content = $(element).html()

        if (!content) return

        const parsed = JSON.parse(content)

        if (Array.isArray(parsed)) {
          result.push(...parsed)
        } else {
          result.push(parsed)
        }
      } catch {
        // Invalid JSON-LD
      }
    }
  )

  return result.slice(0, 20)
}

/* =========================================================
   CSS DESIGN SYSTEM EXTRACTION
========================================================= */

function extractDesignEvidence(
  css: string
): {
  colors: Array<{
    value: string
    occurrences: number
    contexts: string[]
  }>

  fonts: Array<{
    family: string
    selectors: string[]
  }>
} {
  const colorMap = new Map<
    string,
    {
      occurrences: number
      contexts: Set<string>
    }
  >()

  const fontMap = new Map<
    string,
    Set<string>
  >()

  /*
   * =====================================================
   * STEP 1
   * Extract CSS variables
   * =====================================================
   */

  const cssVariables =
    new Map<string, string>()

  const variableMatches =
    css.match(
      /--([\w-]+)\s*:\s*([^;}\n]+)/g
    ) || []

  for (const variable of variableMatches) {
    const match =
      variable.match(
        /--([\w-]+)\s*:\s*([^;}\n]+)/
      )

    if (!match) continue

    const name =
      `--${match[1]}`

    const value =
      match[2].trim()

    cssVariables.set(
      name,
      value
    )
  }

  /*
   * =====================================================
   * STEP 2
   * CSS blocks
   * =====================================================
   */

  const blocks =
    css.match(
      /([^{}]+)\{([^{}]*)\}/g
    ) || []

  for (const block of blocks) {
    const match =
      block.match(
        /([^{}]+)\{([^{}]*)\}/
      )

    if (!match) continue

    const selector =
      match[1].trim()

    const declarations =
      match[2]

    /*
     * =================================================
     * COLORS
     * =================================================
     */

    const rawColors =
      extractRealColors(
        declarations,
        cssVariables
      )

    for (const color of rawColors) {
      addColor(
        colorMap,
        color,
        selector
      )
    }

    /*
     * =================================================
     * FONTS
     * =================================================
     */

    const fontMatches =
      declarations.match(
        /font-family\s*:\s*([^;}]+)/gi
      ) || []

    for (
      const fontDeclaration
      of fontMatches
    ) {
      let family =
        fontDeclaration
          .replace(
            /font-family\s*:/i,
            ''
          )
          .trim()

      /*
       * Resolve:
       *
       * font-family: var(--font-sans)
       */
      const variableMatch =
        family.match(
          /var\((--[\w-]+)\)/
        )

      if (
        variableMatch
      ) {
        const variableValue =
          cssVariables.get(
            variableMatch[1]
          )

        if (
          variableValue
        ) {
          family =
            variableValue
        }
      }

      /*
       * Remove fallback fonts.
       */
      family =
        family
          .split(',')[0]
          .replace(
            /["']/g,
            ''
          )
          .trim()

      if (
        family &&
        !isGenericFont(
          family
        ) &&
        !family.startsWith('var(')
      ) {
        if (
          !fontMap.has(
            family
          )
        ) {
          fontMap.set(
            family,
            new Set()
          )
        }

        fontMap
          .get(family)!
          .add(selector)
      }
    }
  }

  /*
   * =====================================================
   * STEP 3
   * Sort colors by usage
   * =====================================================
   */

  const colors =
    [
      ...colorMap.entries(),
    ]
      .map(
        ([value, data]) => ({
          value,
          occurrences:
            data.occurrences,
          contexts:
            [
              ...data.contexts,
            ].slice(0, 20),
        })
      )
      .sort(
        (a, b) =>
          b.occurrences -
          a.occurrences
      )
      .slice(0, 30)

  /*
   * =====================================================
   * STEP 4
   * Fonts
   * =====================================================
   */

  const fonts =
    [
      ...fontMap.entries(),
    ]
      .map(
        ([family, selectors]) => ({
          family,
          selectors:
            [
              ...selectors,
            ].slice(0, 30),
        })
      )
      .slice(0, 15)

  return {
    colors,
    fonts,
  }
}
function resolveHslVariable(
  value: string
): string {
  /*
   * Supports:
   *
   * 221 83% 53%
   * 221, 83%, 53%
   */

  const match =
    value.match(
      /([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%/
    )

  if (!match) {
    return ''
  }

  const h =
    Number(match[1])

  const s =
    Number(match[2]) / 100

  const l =
    Number(match[3]) / 100

  const c =
    (1 -
      Math.abs(
        2 * l - 1
      )) *
    s

  const x =
    c *
    (1 -
      Math.abs(
        ((h / 60) % 2) - 1
      ))

  const m =
    l - c / 2

  let r = 0
  let g = 0
  let b = 0

  if (h < 60) {
    r = c
    g = x
  } else if (h < 120) {
    r = x
    g = c
  } else if (h < 180) {
    g = c
    b = x
  } else if (h < 240) {
    g = x
    b = c
  } else if (h < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }

  const toHex = (
    value: number
  ) =>
    Math.round(
      (value + m) * 255
    )
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(r)}${toHex(
    g
  )}${toHex(b)}`
}


/* =========================================================
   COLOR HELPERS
========================================================= */

function extractRealColors(
  text: string,
  cssVariables: Map<string, string>
): string[] {
  const results: string[] = []

  /*
   * =====================================================
   * HEX COLORS
   * =====================================================
   */

  const hexColors =
    text.match(
      /#[0-9a-fA-F]{3,8}\b/g
    ) || []

  for (
    const color of hexColors
  ) {
    results.push(
      normalizeColor(color)
    )
  }

  /*
   * =====================================================
   * RGB / RGBA
   * =====================================================
   */

  const rgbColors =
    text.match(
      /rgba?\([^)]+\)/gi
    ) || []

  for (
    const color of rgbColors
  ) {
    /*
     * Ignore CSS variable references.
     */
    if (
      color.includes(
        'var('
      )
    ) {
      continue
    }

    const normalized =
      normalizeColor(color)

    if (
      normalized &&
      !normalized.includes(
        'var('
      )
    ) {
      results.push(
        normalized
      )
    }
  }

  /*
   * =====================================================
   * HSL
   * =====================================================
   */

  const hslColors =
    text.match(
      /hsla?\([^)]+\)/gi
    ) || []

  for (
    const color of hslColors
  ) {
    /*
     * hsl(var(--primary))
     *
     * Resolve the variable instead
     * of storing the invalid value.
     */
    const variableMatch =
      color.match(
        /var\((--[\w-]+)\)/
      )

    if (
      variableMatch
    ) {
      const variableValue =
        cssVariables.get(
          variableMatch[1]
        )

      if (
        variableValue
      ) {
        const resolved =
          resolveHslVariable(
            variableValue
          )

        if (resolved) {
          results.push(
            resolved
          )
        }
      }

      continue
    }

    /*
     * Normal HSL color.
     */
    if (
      !color.includes(
        'var('
      )
    ) {
      results.push(
        color
      )
    }
  }

  return unique(
    results
  )
}

function addColor(
  colorMap: Map<
    string,
    {
      occurrences: number
      contexts: Set<string>
    }
  >,
  color: string,
  context: string
) {
  if (
    !color ||
    isTransparentColor(color)
  ) {
    return
  }

  const existing =
    colorMap.get(color) || {
      occurrences: 0,
      contexts: new Set<string>(),
    }

  existing.occurrences++
  existing.contexts.add(context)

  colorMap.set(
    color,
    existing
  )
}

function normalizeColor(
  color: string
): string {
  const value =
    color.trim().toLowerCase()

  /*
   * Ignore CSS variables.
   */
  if (
    value.includes('var(')
  ) {
    return ''
  }

  /*
   * HEX
   */
  if (
    value.startsWith('#')
  ) {
    if (
      value.length === 4
    ) {
      return (
        '#' +
        value[1] +
        value[1] +
        value[2] +
        value[2] +
        value[3] +
        value[3]
      )
    }

    return value
  }

  /*
   * RGB
   */
  const rgb =
    value.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
    )

  if (rgb) {
    const r =
      Number(rgb[1])

    const g =
      Number(rgb[2])

    const b =
      Number(rgb[3])

    return (
      '#' +
      [r, g, b]
        .map(
          (v) =>
            v
              .toString(16)
              .padStart(
                2,
                '0'
              )
        )
        .join('')
    )
  }

  /*
   * Don't return arbitrary CSS functions.
   */
  if (
    value.includes('(')
  ) {
    return ''
  }

  return value
}
function isTransparentColor(
  color: string
): boolean {
  return (
    color === 'transparent' ||
    color.includes('rgba(0, 0, 0, 0)')
  )
}

function isGenericFont(
  font: string
): boolean {
  const normalized =
    font
      .trim()
      .toLowerCase()

  if (
    normalized.startsWith(
      'var('
    )
  ) {
    return true
  }

  const generic = [
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-sans-serif',
    'ui-serif',
    'ui-monospace',
    'inherit',
    'initial',
    'unset',
    'revert',
    '-apple-system',
    'blinkmacsystemfont',
  ]

  return generic.includes(
    normalized
  )
}

/* =========================================================
   AI EXTRACTION
========================================================= */

async function extractWithAI(
  data: WebsiteData
): Promise<Partial<BusinessInfo>> {
  /*
   * IMPORTANT:
   * Groq organization has an 8,000 TPM limit.
   *
   * Therefore we deliberately keep the AI input small.
   *
   * The website extraction itself can be large,
   * but only the most useful information goes to the AI.
   */

  const websiteContext = {
    url: data.url,

    metadata: data.metadata,

    // Headings are extremely valuable.
    headings: data.headings
      .slice(0, 40),

    // Keep only useful paragraphs.
    paragraphs: data.paragraphs
      .filter((text) => text.length >= 30)
      .slice(0, 50),

    navigation: data.navigation
      .slice(0, 30),

    buttons: data.buttons
      .slice(0, 25),

    /*
     * Only send useful links.
     */
    links: data.links
      .filter((link) =>
        isUsefulLink(link.href)
      )
      .slice(0, 50),

    /*
     * Image ALT text can reveal products/services.
     */
    images: data.images
      .filter(
        (image) =>
          image.alt &&
          image.alt.length > 2
      )
      .slice(0, 25),

    /*
     * JSON-LD is usually very valuable,
     * but don't send enormous objects.
     */
    structuredData:
      data.structuredData
        .slice(0, 5),

    /*
     * Only send the top CSS colors/fonts.
     */
    designSystem: {
      colors: data.colors
        .slice(0, 15)
        .map((color) => ({
          value: color.value,
          occurrences: color.occurrences,
          contexts: color.contexts.slice(0, 5),
        })),

      fonts: data.fonts
        .slice(0, 8)
        .map((font) => ({
          family: font.family,
          selectors: font.selectors.slice(0, 10),
        })),
    },
  }

  /*
   * Convert to JSON.
   */
  let context = JSON.stringify(
    websiteContext,
    null,
    2
  )

  /*
   * Safety limit.
   *
   * ~20,000 characters is roughly 5,000 tokens
   * depending on the content.
   *
   * This leaves enough room for the prompt
   * and AI output under your 8k TPM limit.
   */
  if (context.length > 20000) {
    context = context.substring(
      0,
      20000
    )
  }

  const systemPrompt = `
You are a professional Brand Intelligence Engine.

Analyze a company's website and extract accurate information that will later
be used by an AI to generate Instagram content for that exact business.

IMPORTANT:

- Use ONLY information contained in the website data.
- NEVER invent services, products, locations or claims.
- Be specific.
- Do NOT use generic descriptions such as:
  "Businesses and professionals"
  "Custom solutions"
  "A professional business"
- If information genuinely cannot be determined, return an empty string.
- Identify the actual industry.
- Identify the actual target customer.
- Identify the actual services.
- Identify the problems the business solves.
- Identify the company's value proposition.
- Identify differentiators.
- Analyze the language used by the company to determine its tone.
- Identify recurring topics that can become Instagram content.
- Analyze the CSS evidence to determine the brand colors and fonts.
- Do not invent colors or fonts.
- Return ONLY JSON.
`

  const userPrompt = `
Analyze this website:

${context}

Return ONLY this JSON:

{
  "name": "",
  "targetAudience": "",
  "services": "",
  "about": "",

  "identity": {
    "tagline": "",
    "industry": "",
    "businessType": "",
    "location": "",
    "website": ""
  },

  "audience": {
    "primary": "",
    "secondary": "",
    "demographics": "",
    "needs": [],
    "painPoints": []
  },

  "business": {
    "mission": "",
    "valueProposition": "",
    "differentiators": [],
    "servicesList": [],
    "products": []
  },

  "brand": {
    "personality": [],
    "toneOfVoice": [],
    "keywords": [],
    "contentThemes": [],
    "callsToAction": []
  },

  "designSystem": {
    "colors": {
      "primary": "",
      "secondary": "",
      "accent": "",
      "background": "",
      "text": "",
      "additional": []
    },

    "fonts": {
      "heading": "",
      "body": "",
      "additional": []
    },

    "visualStyle": "",
    "layoutStyle": "",
    "buttonStyle": "",
    "imageryStyle": ""
  },

  "website": {
    "pages": [],
    "headings": [],
    "navigation": [],
    "socialLinks": [],
    "contact": {
      "email": "",
      "phone": "",
      "address": ""
    }
  }
}

EXTRACTION RULES:

name:
Find the actual company/brand name.

targetAudience:
Describe the specific people or businesses this company targets.
Never return generic phrases.

services:
List the actual services offered by the company.

about:
Write 3-5 useful sentences explaining what the company does,
who it serves, what problem it solves and its positioning.

industry:
Identify the company's real industry.

primary audience:
Describe the ideal customer as specifically as possible.

needs:
List the customer's actual needs that the company's services address.

painPoints:
List the problems the customer is likely trying to solve based on
the website's messaging.

differentiators:
Extract actual reasons customers would choose this company.

personality:
Return 3-7 brand personality characteristics.

toneOfVoice:
Return 3-7 characteristics describing how the company communicates.

keywords:
Return important words and phrases repeatedly associated with the business.

contentThemes:
Return topics that could realistically be used for Instagram posts.

colors:
Use the CSS evidence. Do not simply use the first colors found.

fonts:
Determine heading and body fonts based on CSS selectors.

website.pages:
Use the navigation and links to identify actual website sections/pages.

socialLinks:
Return actual social media URLs.

contact:
Return actual contact information when available.
`

  try {
    console.log(
      'Calling Groq AI...'
    )

    console.log(
      `AI context size: ${context.length} characters`
    )

    const response =
      await callGroq({
        prompt:
          `${systemPrompt}\n\n${userPrompt}`,

        model:
          'openai/gpt-oss-120b',

        /*
         * Lower temperature makes extraction
         * more deterministic.
         */
        temperature: 0.1,

        /*
         * We don't need 5000 tokens.
         */
        maxTokens: 2500,

        jsonMode: false,
      })

    console.log(
      'AI Response:',
      response.substring(
        0,
        1000
      )
    )

    const parsed =
      extractJson(
        response,
        {}
      )

    console.log(
      'AI extraction successful'
    )

    return parsed || {}
  } catch (error) {
    console.error(
      'AI extraction failed:',
      error
    )

    return {}
  }
}

function cleanFont(
  font?: string
): string {
  if (!font) {
    return ''
  }

  const value =
    font.trim()

  if (
    value.startsWith(
      'var('
    )
  ) {
    return ''
  }

  if (
    isGenericFont(value)
  ) {
    return ''
  }

  return value
}

/* =========================================================
   NORMALIZE RESULT
========================================================= */

function normalizeBusinessInfo(
  ai: Partial<BusinessInfo>,
  website: WebsiteData
): BusinessInfo {
  const colors =
    ai.designSystem?.colors

  const fonts =
    ai.designSystem?.fonts

  const identity =
    ai.identity

  const audience =
    ai.audience

  const business =
    ai.business

  const brand =
    ai.brand

  const websiteInfo =
    ai.website

  /*
   * Use AI color selection first.
   *
   * If AI couldn't identify something,
   * use CSS evidence instead.
   */
  const cssColors =
    website.colors.map(
      (color) => color.value
    )

  const cssFonts =
    website.fonts.map(
      (font) => font.family
    )

  const primary =
  validColor(
    colors?.primary
  ) ||
  findBestColor(
    website.colors,
    [
      'button',
      'btn',
      'primary',
      'header',
      'nav',
      'h1',
      'h2',
    ]
  ) ||
  '#111827'

const secondary =
  validColor(
    colors?.secondary
  ) ||
  findBestColor(
    website.colors,
    [
      'secondary'
    ]
  ) ||
  '#ffffff'

const accent =
  validColor(
    colors?.accent
  ) ||
  findBestAccentColor(
    website.colors
  ) ||
  '#6366f1'

const background =
  validColor(
    colors?.background
  ) ||
  findBestColor(
    website.colors,
    [
      'background',
      'body',
      'main',
      'section',
    ]
  ) ||
  '#ffffff'

const text =
  validColor(
    colors?.text
  ) ||
  findBestColor(
    website.colors,
    [
      'color',
      'text',
      'body',
      'p',
    ]
  ) ||
  '#111827'

 const headingFont =
  cleanFont(
    fonts?.heading
  ) ||
  findFontForSelectors(
    website.fonts,
    [
      'h1',
      'h2',
      'h3',
    ]
  ) ||
  website.fonts[0]
    ?.family ||
  'Arial'

const bodyFont =
  cleanFont(
    fonts?.body
  ) ||
  findFontForSelectors(
    website.fonts,
    [
      'body',
      'p',
    ]
  ) ||
  website.fonts[1]
    ?.family ||
  headingFont
  /*
   * Build old fields used by your UI.
   */
  const servicesList =
    business?.servicesList ||
    []

  const services =
    ai.services ||
    servicesList.join(', ') ||
    'Not detected'

  const targetAudience =
    ai.targetAudience ||
    audience?.primary ||
    'Not detected'

  const about =
    ai.about ||
    business?.valueProposition ||
    identity?.description ||
    'Not detected'

  return {
    name:
      ai.name ||
      identity?.website ||
      website.metadata.ogTitle ||
      website.metadata.title ||
      'Unknown Business',

    targetAudience,

    services,

    about,

    identity: {
      tagline:
        identity?.tagline || '',

      industry:
        identity?.industry || '',

      businessType:
        identity?.businessType || '',

      location:
        identity?.location || '',

      website:
        identity?.website ||
        website.url,
    },

    audience: {
      primary:
        audience?.primary ||
        targetAudience,

      secondary:
        audience?.secondary || '',

      demographics:
        audience?.demographics || '',

      needs:
        audience?.needs || [],

      painPoints:
        audience?.painPoints || [],
    },

    business: {
      mission:
        business?.mission || '',

      valueProposition:
        business?.valueProposition || '',

      differentiators:
        business?.differentiators ||
        [],

      servicesList:
        servicesList,

      products:
        business?.products || [],
    },

    brand: {
      personality:
        brand?.personality || [],

      toneOfVoice:
        brand?.toneOfVoice || [],

      keywords:
        brand?.keywords || [],

      contentThemes:
        brand?.contentThemes || [],

      callsToAction:
        brand?.callsToAction || [],
    },

    designSystem: {
      colors: {
        primary,
        secondary,
        accent,
        background,
        text,

        additional:
          colors?.additional ||
          cssColors.slice(0, 10),
      },

      fonts: {
        heading: headingFont,

        body: bodyFont,

        additional:
          fonts?.additional ||
          cssFonts.slice(0, 5),
      },

      visualStyle:
        ai.designSystem?.visualStyle ||
        '',

      layoutStyle:
        ai.designSystem?.layoutStyle ||
        '',

      buttonStyle:
        ai.designSystem?.buttonStyle ||
        '',

      imageryStyle:
        ai.designSystem?.imageryStyle ||
        '',
    },

    website: {
      pages:
        websiteInfo?.pages ||
        website.navigation,

      headings:
        websiteInfo?.headings ||
        website.headings.slice(0, 30),

      navigation:
        websiteInfo?.navigation ||
        website.navigation,

      socialLinks:
        websiteInfo?.socialLinks ||
        extractSocialLinks(
          website.links
        ),

      contact: {
        email:
          websiteInfo?.contact?.email ||
          extractEmail(
            website.links
          ),

        phone:
          websiteInfo?.contact?.phone ||
          '',

        address:
          websiteInfo?.contact?.address ||
          '',
      },
    },
  }
}

/* =========================================================
   COLOR INTELLIGENCE
========================================================= */

function findBestColor(
  colors: WebsiteData['colors'],
  preferredContexts: string[]
): string {
  for (const preferred of preferredContexts) {
    const match = colors.find(
      (color) =>
        color.contexts.some(
          (context) =>
            context
              .toLowerCase()
              .includes(
                preferred.toLowerCase()
              )
        )
    )

    if (match) {
      return match.value
    }
  }

  return ''
}

function findBestAccentColor(
  colors: WebsiteData['colors']
): string {
  /*
   * Avoid obvious white / black / grey colors
   * when looking for an accent.
   */
  const candidates =
    colors.filter((color) => {
      const hex =
        color.value.toLowerCase()

      return (
        hex !== '#ffffff' &&
        hex !== '#000000' &&
        hex !== '#fff' &&
        hex !== '#000' &&
        !isGrey(hex)
      )
    })

  return (
    candidates[0]?.value || ''
  )
}

function isGrey(
  hex: string
): boolean {
  if (!hex.startsWith('#')) {
    return false
  }

  const clean =
    hex.length === 7
      ? hex.substring(1)
      : hex.substring(1, 4)

  if (clean.length !== 6) {
    return false
  }

  const r = parseInt(
    clean.substring(0, 2),
    16
  )

  const g = parseInt(
    clean.substring(2, 4),
    16
  )

  const b = parseInt(
    clean.substring(4, 6),
    16
  )

  return (
    Math.abs(r - g) < 10 &&
    Math.abs(g - b) < 10
  )
}

/* =========================================================
   FONT INTELLIGENCE
========================================================= */

function findFontForSelectors(
  fonts: WebsiteData['fonts'],
  selectors: string[]
): string {
  for (const selector of selectors) {
    const match = fonts.find(
      (font) =>
        font.selectors.some(
          (item) =>
            item
              .toLowerCase()
              .includes(
                selector.toLowerCase()
              )
        )
    )

    if (match) {
      return match.family
    }
  }

  return ''
}

/* =========================================================
   LINKS
========================================================= */

function isUsefulLink(
  href: string
): boolean {
  if (!href) return false

  if (
    href.startsWith('#') ||
    href.startsWith('javascript:') ||
    href.startsWith('mailto:')
  ) {
    return false
  }

  return true
}

function extractSocialLinks(
  links: WebsiteData['links']
): string[] {
  const socialDomains = [
    'instagram.com',
    'facebook.com',
    'linkedin.com',
    'twitter.com',
    'x.com',
    'tiktok.com',
    'youtube.com',
    'pinterest.com',
  ]

  return unique(
    links
      .filter((link) =>
        socialDomains.some(
          (domain) =>
            link.href
              .toLowerCase()
              .includes(domain)
        )
      )
      .map(
        (link) => link.href
      )
  )
}

function extractEmail(
  links: WebsiteData['links']
): string {
  const mailto = links.find(
    (link) =>
      link.href
        .toLowerCase()
        .startsWith('mailto:')
  )

  if (mailto) {
    return mailto.href
      .replace(/^mailto:/i, '')
      .split('?')[0]
  }

  return ''
}

/* =========================================================
   VALIDATION
========================================================= */

function validColor(
  value?: string
): string {
  if (!value) return ''

  const color =
    value.trim()

  if (
    /^#[0-9a-fA-F]{3,8}$/.test(
      color
    )
  ) {
    return normalizeColor(color)
  }

  return ''
}

/* =========================================================
   UTILITIES
========================================================= */

function cleanText(
  text: string
): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function unique(
  values: string[]
): string[] {
  return [
    ...new Set(
      values.filter(Boolean)
    ),
  ]
}

/* =========================================================
   FALLBACK
========================================================= */

function createFallbackBusinessInfo(
  url: string
): BusinessInfo {
  return {
    name: 'Unknown Business',

    targetAudience: '',

    services: '',

    about: '',

    identity: {
      tagline: '',
      industry: '',
      businessType: '',
      location: '',
      website: url,
    },

    audience: {
      primary: '',
      secondary: '',
      demographics: '',
      needs: [],
      painPoints: [],
    },

    business: {
      mission: '',
      valueProposition: '',
      differentiators: [],
      servicesList: [],
      products: [],
    },

    brand: {
      personality: [],
      toneOfVoice: [],
      keywords: [],
      contentThemes: [],
      callsToAction: [],
    },

    designSystem: {
      colors: {
        primary: '#111827',
        secondary: '#ffffff',
        accent: '#6366f1',
        background: '#ffffff',
        text: '#111827',
        additional: [],
      },

      fonts: {
        heading: 'Arial',
        body: 'Arial',
        additional: [],
      },

      visualStyle: '',
      layoutStyle: '',
      buttonStyle: '',
      imageryStyle: '',
    },

    website: {
      pages: [],
      headings: [],
      navigation: [],
      socialLinks: [],
      contact: {
        email: '',
        phone: '',
        address: '',
      },
    },
  }
}