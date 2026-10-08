/** Re-mounted on every navigation inside a brand, so each page eases in. */
export default function AppPageTemplate({ children }) {
  return <div className="motion-safe:animate-bk-page">{children}</div>
}
