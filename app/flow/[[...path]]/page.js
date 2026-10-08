import { redirect } from 'next/navigation'

/** /flow was renamed to /app; old links and bookmarks keep working. */
export default function FlowRedirect({ params }) {
  const path = Array.isArray(params?.path) ? params.path.map(encodeURIComponent).join('/') : ''
  redirect(path ? `/app/${path}` : '/app')
}
