import { useRoute } from './lib/router'
import { HomeScreen } from './components/HomeScreen'
import { PrintView } from './components/PrintView'
import { PuzzleEditor } from './components/PuzzleEditor'

export function App() {
  const route = useRoute()

  switch (route.name) {
    case 'editor':
      return <PuzzleEditor key={route.id} id={route.id} />
    case 'print':
      return <PrintView key={route.id} id={route.id} />
    case 'home':
      return <HomeScreen />
  }
}
