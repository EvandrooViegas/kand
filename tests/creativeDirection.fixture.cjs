const studyFixture = require('./designStudy.fixture.cjs')
const quote = (sourceId, value) => ({ sourceId, quote: value })
const identity = () => ({ characteristics: [
  { id: 'palette', domain: 'brand', strength: 'CORE', characteristic: 'Pale ground, dark type and saturated orange accents.', rationale: 'Both references use the same graphical palette roles.', evidence: [1, 2].map(i => quote(`r${i}.color.strategy`, studyFixture.dna.color.strategy)) },
  { id: 'type-scale', domain: 'composition', strength: 'STRONG', characteristic: 'Strong scale contrast between headline and metadata.', rationale: 'Repeated hierarchy, flexible placement.', evidence: [1, 2].map(i => quote(`r${i}.typography.hierarchy`, studyFixture.dna.typography.hierarchy)) },
  { id: 'circle', domain: 'motif', strength: 'OPTIONAL', characteristic: 'Rough circles', rationale: 'Emphasis device, not mandatory identity.', evidence: [quote('r1.decorativeLanguage.elements.0', 'Rough circles')] },
  { id: 'arrow', domain: 'motif', strength: 'REFERENCE_SPECIFIC', characteristic: 'Hand-drawn arrows', rationale: 'Only selected if it supports the post.', evidence: [quote('r1.decorativeLanguage.elements.1', 'Hand-drawn arrows')] },
  { id: 'font-name', domain: 'brand', strength: 'UNCERTAIN', characteristic: 'Exact font family is unknown.', rationale: 'Only stylistic behavior can be used.', evidence: [quote('r1.uncertainties.0', studyFixture.dna.uncertainties[0])] },
], antiPatterns: [], uncertainties: ['Do not assume a particular font family from an uncertain observation.'] })
function direction(brief, canvas, useImagery = false) {
  const hierarchy = ['headline', 'supportingText', 'cta'].filter(key => brief[key] !== null).map((element, i) => ({ element, priority: i + 1, treatment: 'Readable type, sized according to this content role.' }))
  if (useImagery) hierarchy.push({ element: 'imagery', priority: hierarchy.length + 1, treatment: 'Secondary conceptual image supporting the supplied topic.' })
  return {
    concept: 'A typography-led editorial statement', rationale: 'Emphasize the supplied message through scale; a single circle adds restrained energy.', canvas,
    content: { headline: brief.headline, supportingText: brief.supportingText, cta: brief.cta, hierarchy },
    composition: { layoutType: 'Offset editorial hero', alignment: 'Left-aligned copy with balancing space', focalPoint: 'Primary supplied content', headlinePosition: brief.headline ? 'Upper left' : null, supportingTextPosition: brief.supportingText ? 'Below headline' : null, ctaPosition: brief.cta ? 'Lower left' : null, brandingPosition: 'Reserved top edge for a supplied brand asset only', visualPosition: useImagery ? 'Right side, clear of text' : null, negativeSpace: 'medium', density: 'medium', description: 'Arrange this message in a new editorial layout without reproducing a reference.' },
    typography: { headlineStyle: brief.headline ? 'Bold condensed sans-serif' : null, supportingStyle: brief.supportingText ? 'Lighter sans-serif' : null, ctaStyle: brief.cta ? 'Small bold sans-serif' : null, emphasisStrategy: 'Use scale and restrained accent strokes', hierarchyDescription: 'Headline dominates supporting material.' },
    colors: { background: 'Pale ground', primaryText: 'Near black', secondaryText: 'Dark neutral', accent: 'Saturated orange', usageRules: ['Use dark text on a pale ground for readable contrast.'], contextualImagePolicy: 'Retain natural photographic colors; the palette controls designed graphic elements.' },
    imagery: { useImagery, subject: useImagery ? 'Contextual image matching the supplied topic' : null, style: useImagery ? 'Natural photography' : null, crop: useImagery ? 'Off-center' : null, angle: useImagery ? 'Eye level' : null, integration: useImagery ? 'Separate from the text zone' : null },
    motifs: { selected: [{ characteristicId: 'circle', motif: 'Rough circle', reason: 'Focus attention on the primary content.' }], rejected: [{ characteristicId: 'arrow', motif: 'Arrow', reason: 'No directional narrative is needed.' }] },
    appliedPrinciples: [{ characteristicId: 'palette', application: 'Use pale background, dark text and orange marks.' }, { characteristicId: 'type-scale', application: 'Emphasize the primary content with stronger type scale.' }, { characteristicId: 'circle', application: 'Use a single emphasis mark.' }],
    brandConsistency: { coreCharacteristics: [], strongTendenciesUsed: [], optionalCharacteristicsUsed: [] },
    avoid: ['Do not crowd the reading area with additional motifs.'], generationNotes: ['Use stylistic typography rather than an unverified exact font.'], missingInformation: ['A supplied brand asset is needed before branding is rendered.'],
  }
}
module.exports = { identity, direction }
