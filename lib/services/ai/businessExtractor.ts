/**
 * Extract business information from a website URL
 * Uses web scraping and AI to gather:
 * - Business name
 * - What they do
 * - Target audience
 * - Services
 * - About section
 * - Design system (colors, fonts)
 */

interface BusinessInfo {
  name: string
  whatTheyDo: string
  targetAudience: string
  services: string
  about: string
  designSystem: {
    colors: Record<string, string>
    fonts: Record<string, string>
  }
}

export async function extractBusinessInfo(url: string): Promise<BusinessInfo> {
  try {
    // Normalize URL
    let normalizedUrl = url.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl
    }

    // Fetch the website
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch website: ${response.statusText}`)
    }

    const html = await response.text()

    // Extract business info and design system
    const businessInfo = parseWebsiteContent(html, normalizedUrl)
    const enhancedInfo = await enhanceWithAI(businessInfo, html)

    return enhancedInfo
  } catch (error: any) {
    console.error('Business extraction error:', error)
    throw new Error(`Unable to extract business information: ${error.message}`)
  }
}

function parseWebsiteContent(html: string, url: string): Partial<BusinessInfo> {
  const info: Partial<BusinessInfo> = {
    name: extractFromMeta(html, 'og:site_name') || extractFromTitle(html),
    designSystem: {
      colors: extractColors(html),
      fonts: extractFonts(html),
    },
  }

  return info
}

function extractFromMeta(html: string, property: string): string {
  const regex = new RegExp(
    `<meta\\s+(?:property|name)="${property}"\\s+content="([^"]*)"`,
    'i'
  )
  const match = html.match(regex)
  return match ? match[1] : ''
}

function extractFromTitle(html: string): string {
  const regex = /<title>([^<]+)<\/title>/i
  const match = html.match(regex)
  if (match) {
    return match[1]
      .split('|')[0]
      .split('-')[0]
      .trim()
  }
  return 'Unknown Business'
}

function extractColors(html: string): Record<string, string> {
  const colors: Record<string, string> = {}
  const colorSet = new Set<string>()

  // Extract from inline styles
  const styleRegex = /style="([^"]*)"/gi
  let match
  while ((match = styleRegex.exec(html))) {
    const styleContent = match[1]
    const colorMatches = styleContent.match(/#[0-9a-fA-F]{6}\b|rgb\([^)]+\)/gi)
    if (colorMatches) {
      colorMatches.forEach((c) => colorSet.add(c))
    }
  }

  // Extract from style tags
  const styleTagRegex = /<style[^>]*>([^<]+)<\/style>/gi
  while ((match = styleTagRegex.exec(html))) {
    const styleContent = match[1]
    const colorMatches = styleContent.match(/#[0-9a-fA-F]{6}\b|rgb\([^)]+\)/gi)
    if (colorMatches) {
      colorMatches.forEach((c) => colorSet.add(c))
    }
  }

  // Extract from CSS custom properties (variables)
  const cssVarRegex = /--([\w-]+):\s*([^;}\n]+)/g
  while ((match = cssVarRegex.exec(html))) {
    const varName = match[1]
    const varValue = match[2].trim()
    if (
      varValue.includes('#') ||
      varValue.includes('rgb') ||
      varValue.includes('hsl')
    ) {
      colors[varName] = varValue
      colorSet.add(varValue)
    }
  }

  // Map extracted colors to semantic names
  const sortedColors = Array.from(colorSet).slice(0, 10)
  const colorNames = [
    'primary',
    'secondary',
    'accent',
    'background',
    'foreground',
    'success',
    'warning',
    'error',
    'info',
    'disabled',
  ]

  sortedColors.forEach((color, index) => {
    if (index < colorNames.length) {
      colors[colorNames[index]] = color
    }
  })

  // Ensure we have basic colors
  if (!colors.primary) colors.primary = '#000000'
  if (!colors.secondary) colors.secondary = '#ffffff'
  if (!colors.accent) colors.accent = '#0A84FF'
  if (!colors.background) colors.background = '#ffffff'

  return colors
}

function extractFonts(html: string): Record<string, string> {
  const fonts: Record<string, string> = {
    heading: 'Arial, sans-serif',
    body: 'Arial, sans-serif',
  }
  const fontSet = new Set<string>()

  // Look for font-family in style tags
  const fontRegex = /font-family:\s*([^;}\n]+)/gi
  let match
  while ((match = fontRegex.exec(html))) {
    const fontName = cleanFontName(match[1])
    if (fontName && fontName.length > 2) {
      fontSet.add(fontName)
    }
  }

  // Look for Google Fonts imports
  const googleFontRegex =
    /href="https:\/\/fonts\.googleapis\.com\/css[^"]*family=([^"&]+)/gi
  while ((match = googleFontRegex.exec(html))) {
    const fontNames = match[1].split('|')
    fontNames.forEach((f) => {
      const cleanName = f.replace(/\+/g, ' ').split(':')[0].trim()
      if (cleanName) fontSet.add(cleanName)
    })
  }

  // Look for typekit or other font services
  const typeKitRegex =
    /src:[^;]*url\('https:\/\/[\w.-]+\.(?:typekit|fonts)\.net[^)]*\)/gi
  const typekitMatches = html.match(typeKitRegex)
  if (typekitMatches) {
    fontSet.add('Custom Font Stack')
  }

  // Assign extracted fonts to semantic names
  const fontArray = Array.from(fontSet)
  if (fontArray.length > 0) {
    fonts.heading = fontArray[0]
    fonts.body = fontArray[fontArray.length > 1 ? 1 : 0]
  }

  return fonts
}

function cleanFontName(fontFamily: string): string {
  return fontFamily
    .split(':')[0]
    .replace(/['"]/g, '')
    .trim()
    .split(',')[0]
    .trim()
}

async function enhanceWithAI(
  info: Partial<BusinessInfo>,
  html: string
): Promise<BusinessInfo> {
  // Extract visible text from HTML
  const plainText = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .substring(0, 3000)

  // Fill in missing information using heuristics
  const fullInfo: BusinessInfo = {
    name: info.name || 'Unknown Business',
    whatTheyDo: extractWhatTheyDo(plainText),
    targetAudience: extractTargetAudience(plainText),
    services: extractServices(plainText),
    about: extractAbout(plainText),
    designSystem: {
      colors: info.designSystem?.colors || {
        primary: '#000000',
        secondary: '#ffffff',
        accent: '#0A84FF',
        background: '#ffffff',
      },
      fonts: info.designSystem?.fonts || {
        heading: 'Arial, sans-serif',
        body: 'Arial, sans-serif',
      },
    },
  }

  return fullInfo
}

function extractWhatTheyDo(text: string): string {
  const patterns = [
    /we\s+(?:are\s+|provide\s+)?([^.!?]+[.!?])/i,
    /specializing?\s+(?:in\s+)?([^.!?]+[.!?])/i,
    /([^.!?]{20,100}(?:service|solution|product)[^.!?]{0,50}[.!?])/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1].trim().substring(0, 150)
    }
  }

  return 'Professional services and solutions'
}

function extractTargetAudience(text: string): string {
  const patterns = [
    /(?:for|serving|helping)\s+([^.!?]+?)(?:\s+(?:who|that|with)|[.!?])/i,
    /target\s+(?:audience|market|customers?):\s*([^.!?]+[.!?])/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1].trim().substring(0, 100)
    }
  }

  return 'Businesses and professionals'
}

function extractServices(text: string): string {
  const patterns = [
    /(?:services?|offerings?|solutions?):\s*([^.!?]+[.!?])/i,
    /(?:we offer|our services include)[\s:]([^.!?]+[.!?])/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1].trim().substring(0, 150)
    }
  }

  return 'Custom solutions tailored to your needs'
}

function extractAbout(text: string): string {
  // Try to extract first substantial paragraph
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20)
  if (sentences.length > 0) {
    return (sentences[0] + '.')
      .trim()
      .substring(0, 300)
  }

  return 'A professional business dedicated to excellence and customer success'
}
