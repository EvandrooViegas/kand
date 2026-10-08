import { cn } from './brand'

/**
 * Warm sand dunes behind the hero cards: a butter wave curling over two rust dunes.
 * Decorative and theme-independent.
 *
 * The composition is drawn in 0–1385 × 0–440, and every dune continues gently beyond both sides. The box scales the
 * art to its height and keeps the bottom edge, so on a short screen the dunes shrink as a whole, never losing their
 * crest, and the continuation fills the width. Gradients use fixed coordinates so the extensions don't shift colours.
 */
export default function HeroArt({ className = '' }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-1400 0 4185 440"
      preserveAspectRatio="xMidYMax slice"
      className={cn('block', className)}
    >
      <defs>
        <linearGradient id="bk-dune-left" gradientUnits="userSpaceOnUse" x1="0" y1="205" x2="520" y2="440">
          <stop offset="0" stopColor="#B95608" />
          <stop offset="1" stopColor="#9C4200" />
        </linearGradient>
        <linearGradient id="bk-dune-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B99482" />
          <stop offset="1" stopColor="#DCC1AF" />
        </linearGradient>
        <linearGradient id="bk-dune-right" gradientUnits="userSpaceOnUse" x1="640" y1="122" x2="1385" y2="440">
          <stop offset="0" stopColor="#A04300" />
          <stop offset="0.55" stopColor="#923B00" />
          <stop offset="1" stopColor="#772B00" />
        </linearGradient>
        <linearGradient id="bk-dune-ridge" gradientUnits="userSpaceOnUse" x1="700" y1="155" x2="1317" y2="440">
          <stop offset="0" stopColor="#AD4C08" />
          <stop offset="0.5" stopColor="#963D00" />
          <stop offset="1" stopColor="#7A2C00" />
        </linearGradient>
        <linearGradient id="bk-dune-wave" gradientUnits="userSpaceOnUse" x1="0" y1="26" x2="0" y2="440">
          <stop offset="0" stopColor="#FFC33A" />
          <stop offset="0.55" stopColor="#FFB222" />
          <stop offset="1" stopColor="#EE9F14" />
        </linearGradient>
        <radialGradient id="bk-dune-shade" cx="0.5" cy="1" r="0.5">
          <stop offset="0" stopColor="#B86A00" stopOpacity="0.35" />
          <stop offset="1" stopColor="#B86A00" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d="M-1400 336C-1000 326 -420 306 0 291C120 268 300 236 520 205V440H-1400Z" fill="url(#bk-dune-left)" />
      <path d="M752 30C830 18 884 82 918 162L760 210Z" fill="url(#bk-dune-back)" />
      <path d="M640 440C660 330 700 230 790 180 880 135 1000 122 1130 126 1250 130 1330 148 1385 164C1640 236 2160 282 2785 304V440Z" fill="url(#bk-dune-right)" />
      <path d="M700 440C715 330 760 240 860 195 960 155 1100 160 1240 190 1300 203 1350 215 1385 224C1680 288 2180 328 2785 346V440Z" fill="url(#bk-dune-ridge)" />
      <path
        d="M-1400 424C-900 414 -380 392 0 349C110 305 200 270 280 237 380 195 450 150 520 118 620 72 700 38 770 30 820 26 862 62 868 110 872 150 830 180 790 200 740 226 712 268 706 320L700 440H-1400Z"
        fill="url(#bk-dune-wave)"
      />
      <ellipse cx="420" cy="440" rx="380" ry="150" fill="url(#bk-dune-shade)" />
      <path d="M520 118C620 72 700 38 770 30 806 27 838 46 854 74" fill="none" stroke="#FFE39A" strokeWidth="2.5" strokeLinecap="round" opacity="0.75" />
    </svg>
  )
}
