import puppeteer from 'puppeteer';

/**
 * Extract all unique fonts used on a webpage
 * @param {string} url - The URL of the website to analyze
 * @returns {Promise<Object>} JSON object containing font information
 */
async function extractFonts(url) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Extract fonts from all elements with relevance scoring
    const fontData = await page.evaluate(() => {
      const fontFamilies = new Map();
      const fontWeights = new Set();
      const fontStyles = new Set();
      
      // Get all elements
      const elements = document.querySelectorAll('*');
      
      // Helper function to calculate element relevance
      const getRelevanceScore = (element) => {
        const tagName = element.tagName.toLowerCase();
        const computedStyle = window.getComputedStyle(element);
        const fontSize = parseFloat(computedStyle.fontSize);
        
        // Base scores by tag importance
        const tagScores = {
          'h1': 100,
          'h2': 80,
          'h3': 60,
          'h4': 40,
          'h5': 30,
          'h6': 25,
          'header': 20,
          'nav': 15,
          'button': 15,
          'a': 10,
          'p': 5,
          'span': 3,
          'div': 2,
          'li': 4
        };
        
        let score = tagScores[tagName] || 1;
        
        // Boost score based on font size (larger = more important)
        if (fontSize >= 32) score *= 3;
        else if (fontSize >= 24) score *= 2.5;
        else if (fontSize >= 20) score *= 2;
        else if (fontSize >= 18) score *= 1.5;
        else if (fontSize >= 16) score *= 1.2;
        
        // Boost for hero sections, titles, banners
        const className = (typeof element.className === 'string' ? element.className : '').toLowerCase();
        const id = (typeof element.id === 'string' ? element.id : '').toLowerCase();
        const combined = className + ' ' + id;
        
        if (combined.includes('hero')) score *= 2;
        if (combined.includes('title') || combined.includes('heading')) score *= 1.8;
        if (combined.includes('banner')) score *= 1.5;
        if (combined.includes('headline')) score *= 1.8;
        if (combined.includes('display')) score *= 1.5;
        
        return score;
      };
      
      elements.forEach(element => {
        const computedStyle = window.getComputedStyle(element);
        const fontFamily = computedStyle.fontFamily;
        const fontWeight = computedStyle.fontWeight;
        const fontStyle = computedStyle.fontStyle;
        const fontSize = computedStyle.fontSize;
        
        if (fontFamily) {
          const relevance = getRelevanceScore(element);
          
          // Parse font family (remove quotes and split by comma)
          const fonts = fontFamily.split(',').map(f => 
            f.trim().replace(/['"]/g, '')
          );
          
          fonts.forEach(font => {
            if (!fontFamilies.has(font)) {
              fontFamilies.set(font, {
                name: font,
                weights: new Set(),
                styles: new Set(),
                sizes: new Set(),
                usageCount: 0,
                relevanceScore: 0
              });
            }
            
            const fontInfo = fontFamilies.get(font);
            fontInfo.usageCount++;
            fontInfo.relevanceScore += relevance;
            if (fontWeight) fontInfo.weights.add(fontWeight);
            if (fontStyle) fontInfo.styles.add(fontStyle);
            if (fontSize) fontInfo.sizes.add(fontSize);
          });
          
          fontWeights.add(fontWeight);
          fontStyles.add(fontStyle);
        }
      });
      
      // Convert Map and Sets to arrays for JSON serialization
      const fontsArray = Array.from(fontFamilies.values()).map(font => ({
        name: font.name,
        weights: Array.from(font.weights).sort(),
        styles: Array.from(font.styles),
        sizes: Array.from(font.sizes).sort((a, b) => parseFloat(a) - parseFloat(b)),
        usageCount: font.usageCount,
        relevanceScore: font.relevanceScore
      }));
      
      // Sort by relevance score (most relevant first)
      fontsArray.sort((a, b) => b.relevanceScore - a.relevanceScore);
      
      return {
        fonts: fontsArray,
        allWeights: Array.from(fontWeights).sort(),
        allStyles: Array.from(fontStyles),
        totalElements: elements.length
      };
    });
    
    await browser.close();
    
    // Helper function to clean up font names
    const cleanFontName = (fontName) => {
      // Remove quotes first
      fontName = fontName.replace(/['"]/g, '').trim();
      
      // Remove leading double underscores
      fontName = fontName.replace(/^__/, '');
      
      // Replace underscores with spaces first
      fontName = fontName.replace(/_/g, ' ');
      
      // Remove trailing hash patterns (space followed by 6+ hex chars)
      fontName = fontName.replace(/\s+[a-f0-9]{6,}$/i, '');
      
      // Remove hash patterns in the middle (space + hash + space or end)
      fontName = fontName.replace(/\s+[a-f0-9]{6,}(\s|$)/gi, '$1');
      
      // Remove "Fallback" suffix
      fontName = fontName.replace(/\s+Fallback$/i, '');
      
      return fontName.trim();
    };
    
    // Check if a font name is valid (not a CSS variable or garbage)
    const isValidFontName = (fontName) => {
      const lower = fontName.toLowerCase();
      
      // Exclude CSS variables
      if (fontName.startsWith('var(') || fontName.includes('--')) {
        return false;
      }
      
      // Exclude concatenated font names (multiple known fonts smashed together)
      // Pattern: AntonWithImpactCedilla = Anton + Impact + Cedilla
      const knownFonts = ['arial', 'helvetica', 'times', 'courier', 'georgia', 'verdana', 
                          'tahoma', 'trebuchet', 'impact', 'comic', 'palatino', 'garamond',
                          'anton', 'roboto', 'opensans', 'lato', 'montserrat', 'raleway',
                          'poppins', 'nunito', 'ubuntu', 'playfair', 'merriweather', 'oswald'];
      
      // Check if this looks like multiple fonts concatenated (e.g., "AntonWithImpact")
      const lowerNoSpaces = fontName.replace(/\s+/g, '').toLowerCase();
      let matchCount = 0;
      for (const known of knownFonts) {
        if (lowerNoSpaces.includes(known)) {
          matchCount++;
        }
      }
      // If we find 2+ known font names in one string, it's likely concatenated garbage
      if (matchCount >= 2) {
        return false;
      }
      
      // Exclude if it has too many capital letters without spaces (camelCase concatenation)
      const capitalCount = (fontName.match(/[A-Z]/g) || []).length;
      const hasSpaces = fontName.includes(' ');
      const wordCount = fontName.split(/\s+/).length;
      
      // If more than 3 capitals and no spaces, or too many words, likely invalid
      if ((capitalCount > 3 && !hasSpaces) || wordCount > 4) {
        return false;
      }
      
      // Exclude obvious non-fonts
      const invalidPatterns = [
        'undefined', 'null', 'none', 'inherit', 'initial', 'unset',
        'webkit', 'moz-', '-apple-', 'with', 'cedilla'
      ];
      
      return !invalidPatterns.some(pattern => lower.includes(pattern));
    };
    
    // Generic and system fonts to exclude
    const genericFonts = [
      'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
      'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
      'system-ui', 'emoji', 'math', 'fangsong', 'times new roman'
    ];
    
    // Emoji and symbol fonts to exclude
    const emojiSymbolFonts = [
      'apple color emoji', 'segoe ui emoji', 'segoe ui symbol',
      'noto color emoji', 'android emoji', 'emojisymbols', 'emojione color'
    ];
    
    // Filter out generic fonts, clean names, remove duplicates, and return top 3
    const seenFonts = new Set();
    const mainFonts = fontData.fonts
      .map(f => ({
        name: f.name,
        cleanName: cleanFontName(f.name),
        relevanceScore: f.relevanceScore
      }))
      .filter(f => isValidFontName(f.cleanName))
      .filter(f => !genericFonts.includes(f.cleanName.toLowerCase()))
      .filter(f => !genericFonts.includes(f.name.toLowerCase()))
      .filter(f => !emojiSymbolFonts.includes(f.cleanName.toLowerCase()))
      .filter(f => {
        const lower = f.cleanName.toLowerCase();
        if (seenFonts.has(lower)) {
          return false;
        }
        seenFonts.add(lower);
        return true;
      })
      .slice(0, 3)
      .map(f => f.cleanName);
    
    return {
      fonts: mainFonts
    };
    
  } catch (error) {
    await browser.close();
    throw new Error(`Failed to extract fonts: ${error.message}`);
  }
}

// Main execution
if (require.main === module) {
  const url = process.argv[2];
  
  if (!url) {
    console.error('Usage: node extract-fonts.js <URL>');
    console.error('Example: node extract-fonts.js https://example.com');
    process.exit(1);
  }
  
  extractFonts(url)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

export { extractFonts };
