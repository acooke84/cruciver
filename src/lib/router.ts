import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'editor'; id: string }
  | { name: 'print'; id: string }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? ''
  const parts = path.split('/').filter(Boolean)

  if (parts[0] === 'puzzle' && parts[1]) {
    if (parts[2] === 'print') return { name: 'print', id: decodeURIComponent(parts[1]) }
    return { name: 'editor', id: decodeURIComponent(parts[1]) }
  }
  return { name: 'home' }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case 'editor':
      return `#/puzzle/${encodeURIComponent(route.id)}`
    case 'print':
      return `#/puzzle/${encodeURIComponent(route.id)}/print`
    case 'home':
      return '#/'
  }
}

export function navigate(route: Route): void {
  window.location.hash = hrefFor(route)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
