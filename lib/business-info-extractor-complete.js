import 'dotenv/config';
import axios from 'axios';
import { load } from 'cheerio';
import Groq from 'groq-sdk';
import { extractColors } from './services/colorExtractor.js';

// ============================================================================
// GROQ CLIENT MANAGEMENT
// ============================================================================

let groqClient = null;
let defaultModel = null;

function getGroqClient() {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY environment variable is not set');
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

async function getDefaultModel() {
  if (defaultModel) {
    return defaultModel;
  }

  try {
    const groq = getGroqClient();
    const models = await groq.models.list();
    
    // Prioritize known working models
    const workingModels = ['groq/compound-mini', 'mixtral-8x7b-32768', 'llama-3-70b-versatile'];
    let selectedModel = models.data.find(m => workingModels.includes(m.id));
    
    // Fall back to any available model
    if (!selectedModel) {
      selectedModel = models.data[0];
    }
    
    defaultModel = selectedModel.id;
    console.log(`Selected model: ${defaultModel}`);
    return defaultModel;
  } catch (error) {
    console.error('Error fetching models, using fallback:', error.message);
    // Use a known working fallback
    defaultModel = 'groq/compound-mini';
    return defaultModel;
  }
}

// ============================================================================
// PAGE FETCHING & URL HANDLING
// ============================================================================

async function fetchPage(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error.message);
    return null;
  }
}

function findAboutPageUrl($, baseUrl) {
  const baseHost = new URL(baseUrl).hostname;

  // Look for about page link
  const aboutLink = $('a').filter(function () {
    const href = $(this).attr('href');
    const text = $(this).text().toLowerCase().trim();
    
    if (href && (text === 'about' || text === 'about us' || text.includes('about'))) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        if (new URL(absoluteUrl).hostname === baseHost) {
          return true;
        }
      } catch (e) {
        // Skip invalid URLs
      }
    }
    return false;
  }).first();

  if (aboutLink.length > 0) {
    try {
      const href = aboutLink.attr('href');
      return new URL(href, baseUrl).href;
    } catch (e) {
      return null;
    }
  }

  return null;
}

// ============================================================================
// BUSINESS NAME EXTRACTION
// ============================================================================

function extractBusinessName($, url) {
  let candidateName = null;

  // PRIORITY 1: og:site_name (most reliable)
  let ogSiteName = $('meta[property="og:site_name"]').attr('content');
  if (ogSiteName && ogSiteName.trim()) {
    candidateName = ogSiteName.trim();
  }

  // PRIORITY 2: application-name
  if (!candidateName) {
    let appName = $('meta[name="application-name"]').attr('content');
    if (appName && appName.trim()) {
      candidateName = appName.trim();
    }
  }

  // PRIORITY 3: Title tag - parse smartly
  if (!candidateName) {
    const titleText = $('title').text().trim();
    if (titleText) {
      // Remove common suffixes like "- The React Framework", "| Platform", " by Company"
      let cleaned = titleText
        .replace(/\s*[-|–—]\s*.+$/i, '') // Remove everything after dash/pipe
        .replace(/\s+by\s+.+$/i, '') // Remove "by Company"
        .trim();
      
      if (cleaned.length > 2 && cleaned.length < 50) {
        candidateName = cleaned;
      }
    }
  }

  // PRIORITY 4: H1 tag
  if (!candidateName) {
    const h1Text = $('h1').first().text().trim();
    if (h1Text && h1Text.length > 2 && h1Text.length < 50 && !h1Text.toLowerCase().includes('welcome')) {
      candidateName = h1Text;
    }
  }

  // PRIORITY 5: Domain name fallback
  if (!candidateName) {
    const domain = new URL(url).hostname;
    candidateName = domain.replace('www.', '').split('.')[0];
    candidateName = candidateName.charAt(0).toUpperCase() + candidateName.slice(1);
  }

  return candidateName || 'Unknown';
}

// ============================================================================
// ABOUT INFORMATION EXTRACTION
// ============================================================================

function extractAboutInfo($) {
  // PRIORITY 1: Meta description (official, concise)
  let metaDescription = $('meta[name="description"]').attr('content');
  if (metaDescription && metaDescription.trim()) {
    metaDescription = metaDescription.trim();
    // Accept if it's a reasonable length and doesn't look like lorem ipsum
    if (metaDescription.length > 30 && metaDescription.length < 600 && !metaDescription.toLowerCase().includes('lorem')) {
      return metaDescription;
    }
  }

  // PRIORITY 2: og:description (also official)
  let ogDescription = $('meta[property="og:description"]').attr('content');
  if (ogDescription && ogDescription.trim()) {
    ogDescription = ogDescription.trim();
    if (ogDescription.length > 30 && ogDescription.length < 600 && !ogDescription.toLowerCase().includes('lorem')) {
      return ogDescription;
    }
  }

  // PRIORITY 3: First substantial paragraph on page body
  let foundParagraph = null;
  $('body p, main p, article p, section p').each(function() {
    if (foundParagraph) return false; // break if already found
    
    let text = $(this).text().trim();
    // Avoid navigation, testimonials, footers
    if (text && text.length > 60 && text.length < 500 && 
        !text.includes('©') && 
        !text.match(/^(our|the)\s+team/i) &&
        !text.match(/testimonial|quote/i) &&
        !text.includes('button') &&
        !text.toLowerCase().includes('lorem')) {
      foundParagraph = text;
      return false; // break
    }
  });

  if (foundParagraph) {
    return foundParagraph;
  }

  return 'No information found';
}

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

function detectLanguage(text, $) {
  if (!text) return 'unknown';
  
  // First check: HTML lang attribute (most reliable)
  if ($) {
    let htmlLang = $('html').attr('lang');
    if (htmlLang) {
      const langCode = htmlLang.split('-')[0].toLowerCase();
      const validLangs = ['en', 'pt', 'fr', 'de', 'es', 'it'];
      if (validLangs.includes(langCode)) {
        return langCode;
      }
    }
  }
  
  const textLower = text.toLowerCase();
  
  // Check for explicit language indicators first
  if (textLower.includes('português') || textLower.includes('portugal')) {
    return 'pt';
  }
  if (textLower.includes('français') || textLower.includes('france')) {
    return 'fr';
  }
  if (textLower.includes('español') || textLower.includes('españa')) {
    return 'es';
  }
  if (textLower.includes('deutsch') || textLower.includes('deutschland')) {
    return 'de';
  }
  if (textLower.includes('italiano') || textLower.includes('italia')) {
    return 'it';
  }
  
  // Count language-specific words (most reliable method)
  const englishWords = (textLower.match(/\b(the|and|is|to|in|for|of|that|this|with|have|from|or|by|one|all|about|developers|development|software|platform|build|building|create|creating|provides|repository|github)\b/g) || []).length;
  const portugueseWords = (textLower.match(/\b(e|a|de|que|o|para|do|em|um|os|é|por|na|uma|este|ou|com|não|ser|tua|seu|seus|nossa)\b/g) || []).length;
  const frenchWords = (textLower.match(/\b(le|de|et|à|un|la|en|être|des|que|pour|ce|dans|du|qui|est|vous|nous)\b/g) || []).length;
  
  // If English words significantly outnumber others, it's English
  if (englishWords > portugueseWords + 10 && englishWords > frenchWords + 10 && englishWords > 25) {
    return 'en';
  }
  
  // Portuguese indicators (specific accented characters combined with Portuguese words)
  const portugueseAccents = (text.match(/[áéíóúâêôãõç]/gi) || []).length;
  if (portugueseAccents > 30 && portugueseWords > 15) {
    return 'pt';
  }
  
  // French indicators
  const frenchAccents = (text.match(/[àâäéèêëïîôöùûüœæ]/gi) || []).length;
  if (frenchAccents > 18 && frenchWords > 20) {
    return 'fr';
  }
  
  // German indicators
  const germanAccents = (text.match(/[äöüß]/gi) || []).length;
  if (germanAccents > 10) {
    return 'de';
  }
  
  // Default to English if no clear indicators
  return 'en';
}

function extractLogo($) {
  // Try multiple logo sources in priority order
  
  // 1. Apple touch icon
  let logo = $('link[rel="apple-touch-icon"]').attr('href');
  if (logo) return logo;
  
  // 2. Favicon
  logo = $('link[rel="icon"]').attr('href');
  if (logo) return logo;
  
  // 3. Shortcut icon
  logo = $('link[rel="shortcut icon"]').attr('href');
  if (logo) return logo;
  
  // 4. OG image (alternative logo)
  logo = $('meta[property="og:image"]').attr('content');
  if (logo) return logo;
  
  // 5. Twitter image
  logo = $('meta[name="twitter:image"]').attr('content');
  if (logo) return logo;
  
  // 6. Look for logo in header images
  logo = $('header img[alt*="logo" i], nav img[alt*="logo" i]').attr('src');
  if (logo) return logo;
  
  // 7. First image with "logo" in src
  logo = $('img[src*="logo" i]').first().attr('src');
  if (logo) return logo;
  
  return null;
}

// ============================================================================
// ABOUT REFORMATTER - AI-powered "Brand is..." introduction
// ============================================================================

async function reformatAboutAsIntroduction(businessName, rawAboutInfo, services = []) {
  try {
    const groq = getGroqClient();
    const model = await getDefaultModel();
    
    // Detect language
    const isPortuguese = rawAboutInfo.match(/[áéíóúâêôãõç]/i);
    
    const servicesText = services && services.length > 0 
      ? services.slice(0, 4).join(', ') 
      : '';
    
    let prompt;
    if (isPortuguese) {
      prompt = `Crie uma introdução profissional de uma marca no formato TERCEIRA PESSOA, como se estivesse apresentando a empresa para alguém. Use o padrão: "${businessName} delivers..." ou "${businessName} provides..." ou similar.

Informações:
- Nome: ${businessName}
- Sobre: ${rawAboutInfo.substring(0, 300)}
${servicesText ? `- Serviços: ${servicesText}` : ''}

IMPORTANTE: 
1. Escreva em TERCEIRA PESSOA ("${businessName} delivers", "They provide" - NÃO use "We")
2. Máximo 200 palavras
3. Seja profissional e atrativo
4. Destaque o diferencial e valor que entregam
5. Mencione resultados/impacto quando possível

Escreva apenas a introdução, sem explicações adicionais.`;
    } else {
      prompt = `Create a professional brand introduction in THIRD PERSON format, as if introducing the company to someone. Use the pattern: "${businessName} delivers..." or "${businessName} provides..." or similar.

Information:
- Name: ${businessName}
- About: ${rawAboutInfo.substring(0, 300)}
${servicesText ? `- Services: ${servicesText}` : ''}

IMPORTANT:
1. Write in THIRD PERSON ("${businessName} delivers", "They provide" - DO NOT use "We")
2. Maximum 200 words
3. Be professional and engaging
4. Highlight the differentiator and value delivered
5. Mention results/impact when possible

Write only the introduction, without additional explanations.`;
    }

    const response = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: model,
      max_tokens: 400,
      temperature: 0.7,
    });

    const reformatted = response.choices[0]?.message?.content?.trim();
    
    if (reformatted && reformatted.length > 20) {
      return reformatted;
    }
    
    // Fallback: format it manually if AI fails
    return `${businessName} delivers innovative solutions in ${servicesText || 'their industry'}. ${rawAboutInfo.substring(0, 150)}...`;
  } catch (error) {
    console.error(`Error reformatting about info:`, error.message);
    // Fallback formatting
    return `${businessName} delivers comprehensive solutions. ${rawAboutInfo}`;
  }
}

// ============================================================================
// SERVICES EXTRACTION
// ============================================================================

function extractServices($) {
  const services = new Set();

  // PATTERN 1: Look for section that describes features/capabilities
  $('h2, h3').each(function() {
    const text = $(this).text().trim();
    const section = $(this).closest('section');
    const sectionText = section.text().toLowerCase();
    
    // Only include if in a features/capabilities section
    if (sectionText.includes('feature') || sectionText.includes('capabilit') || 
        sectionText.includes('service') || sectionText.includes('product') ||
        sectionText.includes('what\'s')) {
      if (text && text.length > 5 && text.length < 80 &&
          !text.match(/testimonial|quote|customer|framework|get started|what|home|build/i)) {
        services.add(text);
      }
    }
  });

  // PATTERN 2: Feature cards with headings
  $('[class*="feature"], [class*="card"], [class*="item"]').each(function() {
    const $elem = $(this);
    // Skip if it's clearly a testimonial
    if ($elem.text().includes('quote') || $elem.text().includes('"')) return;
    
    const heading = $elem.find('h3, h4, h5, strong, b, .title, .name').first().text().trim();
    if (heading && heading.length > 5 && heading.length < 80 && !heading.match(/testimonial|quote/i)) {
      services.add(heading);
    }
  });

  // PATTERN 3: List items under feature sections
  $('h2, h3').each(function() {
    const headingText = $(this).text().toLowerCase();
    if (headingText.includes('feature') || headingText.includes('capabilit')) {
      let $list = $(this).nextAll('ul, ol').first();
      if ($list.length === 0) {
        $list = $(this).parent().find('ul, ol').first();
      }
      
      $list.find('li').slice(0, 8).each(function() {
        const text = $(this).text().trim().split('\n')[0];
        if (text && text.length > 5 && text.length < 80 && !text.match(/^(our|and|the)/i)) {
          services.add(text);
        }
      });
    }
  });

  // Clean results - be strict about what we include
  let result = Array.from(services)
    .map(s => s.trim())
    .filter(s => {
      if (!s || s.length < 5 || s.length > 100) return false;
      if (s.match(/^[\s\d\-()]+$/)) return false;
      if (s.toLowerCase().includes('lorem') || s.toLowerCase().includes('ipsum')) return false;
      if (s.includes('"') || s.includes('©') || s.includes('button')) return false;
      // Remove phrases that are clearly not service names
      if (s.match(/^(built on|built with|everything you|what\'s|how to|learn)/i)) return false;
      return true;
    })
    .slice(0, 10);

  return result;
}

async function generateServicesWithAI(businessName, aboutInfo, html) {
  try {
    const groq = getGroqClient();
    const model = await getDefaultModel();
    
    // Extract a reasonable text sample from HTML
    const $ = load(html);
    const mainText = $('body').text().substring(0, 1500);
    
    const prompt = `Based on this website content, extract 4-6 KEY services, features, or products offered by "${businessName}".

Website content: ${mainText}

About: ${aboutInfo}

Respond ONLY with a valid JSON array of simple service/product names. Example:
["Service 1", "Service 2", "Service 3"]`;

    const message = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: model,
      max_tokens: 250,
    });

    let responseText = message.choices[0].message.content.trim();
    
    // Try to extract JSON
    try {
      // Remove markdown if present
      responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Find JSON array
      const startIdx = responseText.indexOf('[');
      const lastIdx = responseText.lastIndexOf(']');
      if (startIdx >= 0 && lastIdx > startIdx) {
        responseText = responseText.substring(startIdx, lastIdx + 1);
        const parsed = JSON.parse(responseText);
        
        if (Array.isArray(parsed)) {
          const result = parsed
            .filter(s => s && typeof s === 'string' && s.length > 2 && s.length < 100)
            .slice(0, 8);
          
          if (result.length > 0) {
            return result;
          }
        }
      }
    } catch (parseError) {
      // Silently fail and return empty
    }
  } catch (error) {
    console.error('Error generating services:', error.message);
  }
  
  return [];
}

// ============================================================================
// TARGET AUDIENCE EXTRACTION
// ============================================================================

function extractTargetAudience($) {
  let audienceText = null;

  // Look for specific audience patterns
  $('p, h2, h3, span, div').each(function () {
    const text = $(this).text().trim();
    
    if (!text || text.length < 30 || text.length > 500) return;
    
    // Patterns that indicate target audience
    const audiencePatterns = [
      /(?:perfect for|ideal for|designed for|built for|for\s+(?:small|medium|large|enterprise|startup|solo|independent|growing|new|aspiring)?\s*(?:businesses?|companies?|teams?|professionals?|developers?|entrepreneurs?))/i,
      /(?:help|allow|enable)s?\s+(?:small|medium|large|enterprise|startup|solo|independent|growing|new|aspiring)?\s*(?:businesses?|companies?|teams?|professionals?|developers?|entrepreneurs?)/i,
      /(?:target audience|target market|ideal customer)[\s:].{20,}/i
    ];

    for (const pattern of audiencePatterns) {
      if (pattern.test(text)) {
        // Make sure it's not a testimonial or quote
        if (!text.includes('"') && text.length > 40 && text.length < 400) {
          audienceText = text;
          return false; // break
        }
      }
    }
  });

  return audienceText;
}

async function generateTargetAudienceWithAI(businessName, aboutInfo, services) {
  try {
    const groq = getGroqClient();
    const model = await getDefaultModel();
    
    const servicesText = services && services.length > 0 
      ? services.slice(0, 5).join(', ') 
      : 'Various professional services';
    
    const prompt = `Based on this business information, write a SHORT (2-3 sentences max) description of the target audience/customers. Be specific and concrete, not generic.

Business Name: ${businessName}
About: ${aboutInfo.substring(0, 200)}
Top Services: ${servicesText}

Write ONLY the audience description, nothing else:`;

    const message = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: model,
      max_tokens: 150,
    });

    let result = message.choices[0].message.content.trim();
    return result;
  } catch (error) {
    console.error('Error generating target audience:', error.message);
    return '';
  }
}

// ============================================================================
// DESIGN SYSTEM EXTRACTION
// ============================================================================

async function extractDesignSystem($, url) {
  const fonts = new Set();
  let colors = [];

  try {
    // Use the color extractor service
    console.log('      Using color extractor service...');
    
    const colorResult = await extractColors(url, { 
      silent: true,
      timeout: 30000 
    });
    
    // Extract all available colors from the result
    if (colorResult.primary) {
      colors.push(colorResult.primary);
      console.log(`      Primary: ${colorResult.primary} (score: ${colorResult.primaryScore}) from ${colorResult.primarySources.join(', ')}`);
    }
    
    if (colorResult.secondary) {
      colors.push(colorResult.secondary);
      console.log(`      Secondary: ${colorResult.secondary} (score: ${colorResult.secondaryScore}) from ${colorResult.secondarySources.join(', ')}`);
    }
    
    if (colorResult.tertiary) {
      colors.push(colorResult.tertiary);
      console.log(`      Tertiary: ${colorResult.tertiary} (score: ${colorResult.tertiaryScore}) from ${colorResult.tertiarySources.join(', ')}`);
    }
    
    if (colors.length > 0) {
      console.log(`      ✓ Extracted ${colors.length} brand colors`);
    } else {
      console.log('      ⚠ No colors found');
    }
    
  } catch (error) {
    console.error('      ⚠ Color extraction failed:', error.message);
  }
  
  // Extract fonts from CSS
  $('style').each(function () {
    const content = $(this).html() || '';
    const fontMatches = content.match(/font-family\s*:\s*([^;,}]+?)(?:[,;}]|$)/gi);
    if (fontMatches) {
      fontMatches.forEach((font) => {
        let name = font.replace(/font-family\s*:\s*/i, '').replace(/[,;}]$/i, '').trim().replace(/["']/g, '').trim();
        if (name.length > 2 && name.length < 50 && !name.match(/^(serif|sans-serif|monospace|cursive|system)$/i)) {
          fonts.add(name);
        }
      });
    }
  });
  
  return {
    colors: colors,
    fonts: Array.from(fonts).slice(0, 3),
  };
}

async function enhanceDesignSystemWithAI(businessName, designSystem) {
  // Just return what was extracted - no AI enhancement
  return {
    colors: designSystem.colors || [],
    fonts: designSystem.fonts || [],
  };
}

async function generateBusinessDescription(businessName, aboutInfo, services, targetAudience) {
  try {
    const groq = getGroqClient();
    const model = await getDefaultModel();
    
    // Build clean input strings
    const servicesStr = (services && services.length > 0)
      ? services.slice(0, 4).map(s => s.substring(0, 60)).join(' • ')
      : 'serviços';
    
    const aboutStr = (aboutInfo && aboutInfo.length > 0)
      ? aboutInfo.substring(0, 250)
      : businessName;

    // Bilingual prompt - detect Portuguese by accent marks
    const isPortuguese = aboutStr.match(/[áéíóúâêôãõç]/i);
    
    let prompt;
    if (isPortuguese) {
      prompt = `Crie uma descrição concisa e envolvente com exatamente 120 palavras sobre ${businessName}.

Informações disponíveis:
- Sobre: ${aboutStr}
- Principais serviços: ${servicesStr}

Escreva apenas a descrição, sem formatação adicional, nomes de campos ou explicações. A descrição deve ser clara, profissional e destacar os principais benefícios e diferenciais.`;
    } else {
      prompt = `Create a concise and engaging description with approximately 120 words about ${businessName}.

Available information:
- About: ${aboutStr}
- Main services: ${servicesStr}

Write only the description, without additional formatting, field names, or explanations. The description should be clear, professional, and highlight the main benefits and differentiators.`;
    }

    const response = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: model,
      max_tokens: 600,
      temperature: 0.7,
    });

    const rawText = response.choices[0]?.message?.content;
    
    if (!rawText || typeof rawText !== 'string') {
      console.warn(`Empty response from model ${model} for ${businessName}`);
      return '';
    }
    
    let description = rawText.trim();
    
    // Accept anything longer than 50 chars
    if (description.length < 50) {
      console.warn(`Description too short (${description.length} chars) for ${businessName}`);
      return '';
    }
    
    // Light cleanup
    description = description
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Ensure proper ending
    if (description && !description.match(/[.!?]$/)) {
      description += '.';
    }
    
    console.log(`✓ Generated description for ${businessName} (${description.length} chars)`);
    return description;
  } catch (error) {
    console.error(`Error generating description for ${businessName}:`, error.message);
    return '';
  }
}

// ============================================================================
// MAIN EXTRACTION ORCHESTRATOR
// ============================================================================

async function extractBusinessInfo(url) {
  try {
    // Validate and normalize URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    console.log(`\n========== BUSINESS INFORMATION EXTRACTION ==========\n`);

    // Step 1: Fetch main page
    console.log(`[1/7] Fetching main page: ${url}`);
    let html = await fetchPage(url);
    if (!html) throw new Error('Failed to fetch main page');

    let $ = load(html);
    let pageCount = 1;

    // Step 1.5: Extract logo
    console.log(`[1.5/7] Extracting logo...`);
    let logo = extractLogo($);
    if (logo) {
      // Convert relative URLs to absolute
      if (!logo.startsWith('http://') && !logo.startsWith('https://')) {
        const baseUrl = new URL(url);
        logo = new URL(logo, baseUrl).href;
      }
      console.log(`      ✓ Logo found: ${logo.substring(0, 80)}...`);
    } else {
      console.log(`      ✗ Logo not found`);
    }

    // Step 2: Extract business name
    console.log(`[2/7] Extracting business name...`);
    const businessName = extractBusinessName($, url);
    console.log(`      ✓ Business Name: ${businessName}`);

    // Step 3: Extract about info (raw)
    console.log(`[3/7] Extracting about information...`);
    let rawAboutInfo = extractAboutInfo($);
    console.log(`      ✓ Raw About Info: ${rawAboutInfo.substring(0, 100)}...`);

    // Step 3.5: Detect language
    console.log(`[3.5/7] Detecting language...`);
    const language = detectLanguage(rawAboutInfo + ' ' + $('body').text(), $);
    console.log(`      ✓ Language detected: ${language}`);

    // Step 4: Extract services
    console.log(`[4/7] Extracting services...`);
    let services = extractServices($);
    console.log(`      ✓ Found ${services.length} services`);
    
    // If no services or very few, use AI to extract them
    if (!services || services.length < 3) {
      console.log(`      → Using AI to extract services...`);
      const aiServices = await generateServicesWithAI(businessName, rawAboutInfo, html);
      if (aiServices && aiServices.length > 0) {
        services = aiServices;
        console.log(`      ✓ AI extracted ${services.length} services`);
      } else {
        console.log(`      ⚠ AI extraction returned empty`);
      }
    }
    
    // Ensure services is always an array
    if (!services || !Array.isArray(services)) {
      services = [];
    }

    // Step 5: Extract target audience
    console.log(`[5/7] Extracting target audience...`);
    let targetAudience = extractTargetAudience($);
    
    // If not found, generate with AI (more reliable, now that we have services)
    if (!targetAudience) {
      console.log(`      → Generating with AI...`);
      targetAudience = await generateTargetAudienceWithAI(
        businessName,
        rawAboutInfo,
        services,
      );
      console.log(`      ✓ Generated`);
    } else {
      console.log(`      ✓ Extracted: ${targetAudience.substring(0, 60)}...`);
    }

    // Step 6: Extract design system
    console.log(`[6/7] Extracting design system...`);
    let designSystem = await extractDesignSystem($, url);
    console.log(`      ✓ Found ${designSystem.colors.length} colors, ${designSystem.fonts.length} fonts`);

    // Try to find and fetch about page
    console.log(`\n[Additional] Looking for about page...`);
    const aboutPageUrl = findAboutPageUrl($, url);
    
    if (aboutPageUrl) {
      console.log(`      ✓ Found: ${aboutPageUrl}`);
      const aboutHtml = await fetchPage(aboutPageUrl);
      
      if (aboutHtml) {
        pageCount = 2;
        const about$ = load(aboutHtml);

        // Extract enhanced data from about page
        console.log(`      Updating info from about page...`);
        
        const aboutPageInfo = extractAboutInfo(about$);
        if (aboutPageInfo && aboutPageInfo.length > rawAboutInfo.length) {
          rawAboutInfo = aboutPageInfo;
        }

        const aboutServices = extractServices(about$);
        if (aboutServices.length > services.length) {
          services = aboutServices;
        }

        const aboutPageAudience = extractTargetAudience(about$);
        if (aboutPageAudience) {
          targetAudience = aboutPageAudience;
        }

        const aboutDesign = await extractDesignSystem(about$, url);
        if (aboutDesign.colors.length > designSystem.colors.length || 
            aboutDesign.fonts.length > designSystem.fonts.length) {
          designSystem = {
            colors: [...new Set([...designSystem.colors, ...aboutDesign.colors])],
            fonts: [...new Set([...designSystem.fonts, ...aboutDesign.fonts])],
          };
        }

        // Try to find logo on about page too
        if (!logo) {
          const aboutLogo = extractLogo(about$);
          if (aboutLogo) {
            const baseUrl = new URL(url);
            logo = new URL(aboutLogo, baseUrl).href;
          }
        }
      }
    } else {
      console.log(`      ✗ No about page found`);
    }

    // Enhance design system if incomplete
    if (!designSystem.colors.length || !designSystem.fonts.length) {
      console.log(`[AI Enhancement] Enhancing design system...`);
      designSystem = await enhanceDesignSystemWithAI(businessName, designSystem);
      console.log(`      ✓ Enhanced`);
    }

    // Step 7: Generate brand introduction in third person
    console.log(`[7/7] Generating brand introduction...`);
    const brandIntroduction = await reformatAboutAsIntroduction(
      businessName,
      rawAboutInfo,
      services
    );
    
    if (brandIntroduction && brandIntroduction.length > 0) {
      console.log(`      ✓ Generated (${brandIntroduction.length} chars)`);
    } else {
      console.log(`      ⚠ Generation returned empty`);
    }

    console.log(`\n========== EXTRACTION COMPLETE ==========\n`);
    
    // Display the brand introduction prominently
    if (brandIntroduction && brandIntroduction.trim().length > 0) {
      console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
      console.log(`║          BRAND INTRODUCTION                                   ║`);
      console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
      console.log(brandIntroduction);
      console.log(`\n`);
    }

    // Clean up about text from Google Translate warnings
    let cleanAbout = brandIntroduction || rawAboutInfo;
    cleanAbout = cleanAbout
      .replace(/ATENÇÃO:.*?tradução automática\./gi, '')
      .replace(/WARNING:.*?automatic translation\./gi, '')
      .replace(/AVISO:.*?traducción automática\./gi, '')
      .replace(/NOTE:.*?automatic translation\./gi, '')
      .replace(/Isto pode.*?não nos\s*responsabilizamos.*?automática\./gi, '')
      .replace(/This may.*?this automatic translation\./gi, '')
      .replace(/Esto puede.*?esta traducción automática\./gi, '')
      .replace(/This might.*?this automatic translation\./gi, '')
      .trim();

    const result = {
      name: businessName || 'Unknown',
      about: cleanAbout,
      logo: logo || null,
      language: language,
      designSystem: {
        colors: designSystem.colors || [],
        fonts: designSystem.fonts || [],
      },
    };

    return result;

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    throw error;
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error('\nUsage: node business-info-extractor-complete.js <url>\n');
    console.error('Example:');
    console.error('  node business-info-extractor-complete.js https://example.com\n');
    process.exit(1);
  }

  try {
    const result = await extractBusinessInfo(url);
    console.log('\n=== EXTRACTED DATA ===\n');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('\n✗ Extraction Failed:', error.message);
    process.exit(1);
  }
}

// Export for module use
export { extractBusinessInfo };

// Run if executed directly
if (require.main === module) {
  main();
}
