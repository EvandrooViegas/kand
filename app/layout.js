import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'

export const metadata = {
  title: 'DynaCanvas - Dynamic Instagram Post Generator',
  description: 'Design templates and render them dynamically via API',
}

const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Inter:ital,wght@0,400;0,700;1,400;1,700',
    'family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400;1,700',
    'family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700',
    'family=Oswald:wght@300;400;500;600;700',
    'family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700',
    'family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700',
    'family=Bebas+Neue',
    'family=Dancing+Script:wght@400;500;600;700',
    'family=Pacifico',
    'family=Lobster',
    'family=Raleway:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700',
    'family=Lato:ital,wght@0,300;0,400;0,700;0,900;1,400;1,700',
    'family=Open+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,700',
  ].join('&') +
  '&display=swap'

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        <script dangerouslySetInnerHTML={{__html:'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);'}} />
      </head>
      <body className="bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
