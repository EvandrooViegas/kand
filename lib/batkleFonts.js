import { Bricolage_Grotesque, DM_Sans } from 'next/font/google'

// opsz lets the browser pick the tighter display cut at large sizes.
const display = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz'], variable: '--font-bk-display', display: 'swap' })
const body = DM_Sans({ subsets: ['latin'], variable: '--font-bk-body', display: 'swap' })

/** Classes that define the Batkle font variables. Add them to every Batkle root, including portaled dialogs. */
export const batkleFonts = `${display.variable} ${body.variable}`
