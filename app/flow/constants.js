// Flow page constants and configuration
import {
  BookOpen, Users, Zap, Sparkles, Mic2
} from 'lucide-react'

export const BEBAS = {
  fontFamily: "'Bebas Neue', sans-serif",
  letterSpacing: '0.01em'
}

export const TONES = [
  { id: 'informative', icon: BookOpen, label: 'Informative', desc: 'Clear, factual, calmly authoritative' },
  { id: 'helpful', icon: Users, label: 'Helpful', desc: 'Warm, empathetic, practical advice' },
  { id: 'aggressive', icon: Zap, label: 'Aggressive', desc: 'Bold, urgent, breaks the scroll pattern' },
  { id: 'inspiring', icon: Sparkles, label: 'Inspiring', desc: 'Motivational, aspirational, emotional' },
  { id: 'playful', icon: Mic2, label: 'Playful', desc: 'Fun, witty, human conversational' },
]

export const LANGUAGES = [
  { id: 'english', label: 'English', flag: '🇬🇧' },
  { id: 'spanish', label: 'Spanish', flag: '🇪🇸' },
  { id: 'french', label: 'French', flag: '🇫🇷' },
  { id: 'german', label: 'German', flag: '🇩🇪' },
  { id: 'italian', label: 'Italian', flag: '🇮🇹' },
  { id: 'portuguese', label: 'Portuguese', flag: '🇵🇹' },
  { id: 'dutch', label: 'Dutch', flag: '🇳🇱' },
  { id: 'polish', label: 'Polish', flag: '🇵🇱' },
  { id: 'swedish', label: 'Swedish', flag: '🇸🇪' },
  { id: 'russian', label: 'Russian', flag: '🇷🇺' },
  { id: 'japanese', label: 'Japanese', flag: '🇯🇵' },
  { id: 'chinese', label: 'Chinese (Simplified)', flag: '🇨🇳' },
  { id: 'korean', label: 'Korean', flag: '🇰🇷' },
  { id: 'arabic', label: 'Arabic', flag: '🇸🇦' },
]

export const PROGRESS_STEPS = [
  'Reading your brand profile',
  'Studying the canvas layout',
  'Choosing an angle from your ideas',
  'Writing the hook',
  'Filling in the body copy',
  'Writing a matching caption',
  'Picking imagery',
  'Rendering the artwork',
]

export const BRAND_FORM_FIELDS = [
  {
    key: 'businessName',
    label: 'Business name',
    icon: 'Building2',
    placeholder: 'Acme Coffee Co.',
    question: 'What is your business called?',
    required: true,
  },
  {
    key: 'description',
    label: 'What you do',
    icon: 'BookOpen',
    placeholder: 'We roast single-origin beans and ship them fresh across Europe.',
    question: 'In 2-3 sentences, what do you actually do?',
    required: true,
    multiline: true,
  },
  {
    key: 'audience',
    label: 'Who you serve',
    icon: 'Users',
    placeholder: 'Home baristas who care about specialty coffee.',
    question: 'Who is your ideal customer?',
    multiline: false,
  },
  {
    key: 'voice',
    label: 'Voice / personality',
    icon: 'Mic2',
    placeholder: 'Warm, curious, a little nerdy about the craft.',
    question: 'How does your brand sound in one sentence?',
    multiline: false,
  },
  {
    key: 'extra',
    label: 'One insider truth',
    icon: 'Sparkles',
    placeholder: 'Most competitors over-roast to hide bad beans. We do the opposite.',
    question: 'What is the ONE thing you wish customers knew?',
    multiline: true,
  },
]
