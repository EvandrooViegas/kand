import './globals.css'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'DynaCanvas - Dynamic Instagram Post Generator',
  description: 'Design templates and render them dynamically via API',
}

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Inter:wght@400;700',
    'family=Roboto:wght@400;700',
    'family=Poppins:wght@400;700',
    'family=Oswald:wght@400;700',
    'family=Montserrat:wght@400;700',
    'family=Playfair+Display:wght@400;700',
    'family=Bebas+Neue',
    'family=Dancing+Script:wght@400;700',
    'family=Pacifico',
    'family=Lobster',
    'family=Raleway:wght@400;700',
    'family=Lato:wght@400;700',
    'family=Open+Sans:wght@400;700',
  ].join('&') +
  '&display=swap'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body>
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
