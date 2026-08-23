/**
 * Enhanced Color Extractor using Puppeteer
 * Extracts colors from rendered DOM elements (buttons, headings, etc.)
 * Works with Tailwind CSS and all modern frameworks
 */

const puppeteer = require('puppeteer');

/**
 * Convert RGB string to Hex
 */
function rgbToHex(rgb) {
  if (!rgb || rgb === 'rgba(0, 0, 0, 0)' || rgb === 'transparent') return null;
  
  const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
  if (!match) return null;
  
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * Check if color is valid (not too light/dark/gray)
 */
function isValidColor(hex) {
  if (!hex) return false;
  
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  
  // Exclude very light colors (near white)
  if (r > 240 && g > 240 && b > 240) return false;
  
  // Exclude very dark colors (near black)
  if (r < 30 && g < 30 && b < 30) return false;
  
  // Exclude grays (colors where R, G, B are too similar)
  const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  if (maxDiff < 15) return false;
  
  return true;
}

/**
 * Calculate color vibrancy score
 */
function getColorVibrancy(hex) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const brightness = max / 255;
  
  return saturation * brightness;
}

/**
 * Extract colors from rendered page
 */
async function extractColors(url, options = {}) {
  const {
    headless = true,
    timeout = 30000,
    viewport = { width: 1920, height: 1080 },
    silent = false
  } = options;
  
  let browser;
  
  try {
    if (!silent) console.log(`Launching browser...`);
    browser = await puppeteer.launch({ 
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport(viewport);
    
    if (!silent) console.log(`Navigating to: ${url}`);
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout 
    });
    
    // Wait a bit for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (!silent) console.log('Analyzing rendered elements...');
    
    // Extract colors from important elements
    const colorData = await page.evaluate(() => {
      const results = {
        buttons: [],
        headings: [],
        links: [],
        backgrounds: [],
        borders: []
      };
      
      // Helper to get computed color
      const getColor = (element, property) => {
        const computed = window.getComputedStyle(element);
        return computed[property];
      };
      
      // Analyze buttons (highest priority)
      const buttons = document.querySelectorAll('button, a[role="button"], input[type="submit"], input[type="button"], [class*="btn"], [class*="button"]');
      buttons.forEach(btn => {
        const color = getColor(btn, 'color');
        const bgColor = getColor(btn, 'backgroundColor');
        const borderColor = getColor(btn, 'borderColor');
        
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
          results.buttons.push({ color: bgColor, weight: 10, type: 'button-bg' });
        }
        if (color && color !== 'rgba(0, 0, 0, 0)') {
          results.buttons.push({ color: color, weight: 8, type: 'button-text' });
        }
        if (borderColor && borderColor !== 'rgba(0, 0, 0, 0)') {
          results.buttons.push({ color: borderColor, weight: 7, type: 'button-border' });
        }
      });
      
      // Analyze headings (high priority)
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="title"]');
      headings.forEach(heading => {
        const color = getColor(heading, 'color');
        const bgColor = getColor(heading, 'backgroundColor');
        
        // H1 and H2 get higher weight
        const weight = heading.tagName === 'H1' ? 9 : heading.tagName === 'H2' ? 8 : 6;
        
        if (color && color !== 'rgba(0, 0, 0, 0)') {
          results.headings.push({ color: color, weight, type: `${heading.tagName}-text` });
        }
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
          results.headings.push({ color: bgColor, weight: weight - 1, type: `${heading.tagName}-bg` });
        }
      });
      
      // Analyze prominent links
      const links = document.querySelectorAll('a[class*="nav"], a[class*="menu"], nav a, header a');
      links.forEach(link => {
        const color = getColor(link, 'color');
        if (color && color !== 'rgba(0, 0, 0, 0)') {
          results.links.push({ color: color, weight: 5, type: 'link' });
        }
      });
      
      // Analyze prominent sections
      const sections = document.querySelectorAll('header, nav, main > section:first-child, [class*="hero"], [class*="banner"]');
      sections.forEach(section => {
        const bgColor = getColor(section, 'backgroundColor');
        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
          results.backgrounds.push({ color: bgColor, weight: 4, type: 'section-bg' });
        }
      });
      
      return results;
    });
    
    if (!silent) {
      console.log(`Found ${colorData.buttons.length} button colors`);
      console.log(`Found ${colorData.headings.length} heading colors`);
      console.log(`Found ${colorData.links.length} link colors`);
      console.log(`Found ${colorData.backgrounds.length} background colors`);
    }
    
    // Process and weight colors
    const colorFrequency = {};
    const colorSources = {};
    
    const processColors = (colors) => {
      colors.forEach(({ color, weight, type }) => {
        const hex = rgbToHex(color);
        if (hex && isValidColor(hex)) {
          const vibrancy = getColorVibrancy(hex);
          const finalWeight = weight * (1 + vibrancy * 2);
          
          colorFrequency[hex] = (colorFrequency[hex] || 0) + finalWeight;
          
          if (!colorSources[hex]) {
            colorSources[hex] = [];
          }
          colorSources[hex].push(type);
        }
      });
    };
    
    processColors(colorData.buttons);
    processColors(colorData.headings);
    processColors(colorData.links);
    processColors(colorData.backgrounds);
    
    if (Object.keys(colorFrequency).length === 0) {
      await browser.close();
      return {
        primary: null,
        secondary: null,
        message: 'No prominent colors found',
        url
      };
    }
    
    // Sort by weighted frequency
    const sortedColors = Object.entries(colorFrequency)
      .sort((a, b) => b[1] - a[1])
      .map(([color, score]) => ({
        color,
        score: Math.round(score * 10) / 10,
        sources: [...new Set(colorSources[color])],
        occurrences: colorSources[color].length
      }));
    
    await browser.close();
    
    return {
      primary: sortedColors[0]?.color || null,
      primaryScore: sortedColors[0]?.score || 0,
      primarySources: sortedColors[0]?.sources || [],
      secondary: sortedColors[1]?.color || null,
      secondaryScore: sortedColors[1]?.score || 0,
      secondarySources: sortedColors[1]?.sources || [],
      tertiary: sortedColors[2]?.color || null,
      tertiaryScore: sortedColors[2]?.score || 0,
      tertiarySources: sortedColors[2]?.sources || [],
      uniqueColors: Object.keys(colorFrequency).length,
      topColors: sortedColors.slice(0, 10),
      url
    };
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw new Error(`Failed to extract colors: ${error.message}`);
  }
}

// CLI usage
if (require.main === module) {
  const url = process.argv[2];
  const jsonOutput = process.argv.includes('--json') || process.argv.includes('-j');
  
  if (!url) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'URL is required', usage: 'node colorExtractorPuppeteer.js <url> [--json]' }));
    } else {
      console.error('Usage: node colorExtractorPuppeteer.js <url> [--json]');
    }
    process.exit(1);
  }
  
  extractColors(url, { silent: jsonOutput })
    .then(result => {
      if (jsonOutput) {
        // JSON output
        console.log(JSON.stringify(result, null, 2));
      } else {
        // Pretty output
        if (!result.primary) {
          console.log('\n❌ No colors found');
          return;
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('🎨 COLOR EXTRACTION RESULTS (DOM-BASED)');
        console.log('='.repeat(70));
        
        console.log(`\n🥇 Primary Color: ${result.primary}`);
        console.log(`   Score: ${result.primaryScore}`);
        console.log(`   Found in: ${result.primarySources.join(', ')}`);
        
        if (result.secondary) {
          console.log(`\n🥈 Secondary Color: ${result.secondary}`);
          console.log(`   Score: ${result.secondaryScore}`);
          console.log(`   Found in: ${result.secondarySources.join(', ')}`);
        }
        
        if (result.tertiary) {
          console.log(`\n🥉 Tertiary Color: ${result.tertiary}`);
          console.log(`   Score: ${result.tertiaryScore}`);
          console.log(`   Found in: ${result.tertiarySources.join(', ')}`);
        }
        
        console.log(`\n📊 Statistics:`);
        console.log(`   - Unique prominent colors: ${result.uniqueColors}`);
        
        if (result.topColors.length > 3) {
          console.log(`\n🎨 Top ${Math.min(10, result.topColors.length)} Colors:`);
          result.topColors.forEach((item, i) => {
            console.log(`   ${i + 1}. ${item.color} (score: ${item.score}) - ${item.sources.join(', ')}`);
          });
        }
        
        console.log('\n' + '='.repeat(70) + '\n');
      }
    })
    .catch(err => {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: err.message, url }));
      } else {
        console.error('❌ Error:', err.message);
      }
      process.exit(1);
    });
}

module.exports = { extractColors };
