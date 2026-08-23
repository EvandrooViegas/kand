/**
 * Website Extractor Service
 *
 * Main entry point for business intelligence extraction.
 * Modular architecture with separated concerns.
 */

export { extractBusinessInfoFromWebsite } from './websiteExtractor'
export type { BusinessInfo, WebsiteData } from './types'

// Re-export utilities if needed by other modules
export { normalizeUrl } from './urlUtils'
export { fetchWebsite } from './extractors/fetchExtractor'
export { extractWebsiteData } from './extractors/htmlExtractor'
export { extractDesignEvidence } from './extractors/cssExtractor'
export { extractWithAI } from './extractors/aiExtractor'
export { normalizeBusinessInfo, createFallbackBusinessInfo } from './normalizers/businessNormalizer'

// Color utilities
export { normalizeColor, isTransparentColor, isGrey, validColor, resolveHslVariable } from './utils/colorUtils'

// Font utilities
export { isGenericFont, cleanFont } from './utils/fontUtils'

// Text utilities
export { cleanText, unique } from './utils/textUtils'

// Link utilities
export { isUsefulLink, extractSocialLinks, extractEmail } from './utils/linkUtils'
