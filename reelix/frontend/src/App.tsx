import { useState } from 'react'
import LandingPage from './components/LandingPage'
import AdCreator from './components/AdCreator'
import DemoRecorder from './components/DemoRecorder'

export type View = 'landing' | 'creator' | 'demo'

export default function App() {
  const [view, setView] = useState<View>('landing')

  if (view === 'creator') return <AdCreator onBack={() => setView('landing')} />
  if (view === 'demo') return <DemoRecorder onBack={() => setView('landing')} />

  return <LandingPage onStart={() => setView('creator')} onDemo={() => setView('demo')} />
}
