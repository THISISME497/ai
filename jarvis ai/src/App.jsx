import { useEffect, useRef, useState } from 'react'

const now = () => new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())

function toMathExpression(prompt) {
  const normalized = prompt.toLowerCase().trim()
    .replace(/^(?:calculate|solve|math|do the math|what is)\s+/, '')
    .replace(/multiplied by|times/g, '*')
    .replace(/divided by|over/g, '/')
    .replace(/plus/g, '+')
    .replace(/minus/g, '-')
    .replace(/to the power of|power of/g, '^')
    .replace(/\bx\b/g, '*')
  return /^[0-9+\-*/^%().,\s]+$/.test(normalized) && /[+\-*/^%]/.test(normalized) ? normalized : null
}

export default function App() {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [text, setText] = useState('')
  const [message, setMessage] = useState('Ready when you are.')
  const [history, setHistory] = useState([])
  const [muted, setMuted] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [alwaysListening, setAlwaysListening] = useState(true)
  const [dictionaryMode, setDictionaryMode] = useState(false)
  const recognition = useRef(null)
  const keepListening = useRef(true)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recognizer = new SpeechRecognition()
    recognizer.continuous = true
    recognizer.interimResults = true
    recognizer.lang = 'en-US'
    recognizer.onstart = () => { setListening(true); setMessage('Always listening. Say a command.') }
    recognizer.onresult = event => {
      const transcript = Array.from(event.results).map(result => result[0].transcript).join('')
      setText(transcript)
      if (event.results[event.results.length - 1].isFinal) submit(transcript)
    }
    recognizer.onerror = event => {
      setListening(false)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        keepListening.current = false
        setAlwaysListening(false)
        setMessage('Please allow microphone access, then enable always listening.')
      }
    }
    recognizer.onend = () => {
      setListening(false)
      if (keepListening.current) window.setTimeout(() => {
        try { recognizer.start() } catch { /* Recognition is already restarting. */ }
      }, 250)
    }
    recognition.current = recognizer
    window.setTimeout(() => { try { recognizer.start() } catch { /* Browser may require a first permission grant. */ } }, 400)
    return () => { keepListening.current = false; recognizer.abort() }
  }, [])

  const speak = (words) => {
    if (muted || !('speechSynthesis' in window)) return
    if (listening && recognition.current) {
      keepListening.current = false
      recognition.current.stop()
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(words)
    utterance.rate = 1.02
    utterance.pitch = 0.9
    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => {
      setSpeaking(false)
      if (alwaysListening && recognition.current) {
        keepListening.current = true
        try { recognition.current.start() } catch { /* Recognition is restarting. */ }
      }
    }
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  const submit = async (value = text) => {
    const prompt = value.trim()
    if (!prompt || thinking) return
    const userMessage = { role: 'YOU', text: prompt, time: now() }
    const conversation = [...history, userMessage]
    setHistory(conversation)
    setText('')
    setThinking(true)
    setMessage('Consulting the AI core...')
    try {
      const researchMatch = prompt.match(/^\s*(?:research|look up|search (?:the )?web for|find out about)\s+(.+)/i)
      const mathExpression = toMathExpression(prompt)
      const dictionaryMatch = prompt.match(/^\s*(?:define|learn word|meaning of)\s+([a-z'-]+)|^\s*what does\s+([a-z'-]+)\s+mean\??\s*$/i)
      const dictionaryWord = dictionaryMatch?.[1] || dictionaryMatch?.[2]
      const endpoint = mathExpression ? '/api/math' : researchMatch ? '/api/research' : dictionaryWord ? '/api/dictionary' : '/api/chat'
      const payload = mathExpression ? { expression: mathExpression } : researchMatch ? { topic: researchMatch[1] } : dictionaryWord ? { word: dictionaryWord } : { message: prompt, history, dictionaryMode }
      const result = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const raw = await result.text()
      let data
      try { data = JSON.parse(raw) } catch {
        throw new Error('Jarvis AI server is not running. Run Start-Jarvis.bat, then open http://localhost:5190.')
      }
      if (!result.ok) throw new Error(data.error || 'The Jarvis AI server returned an error.')
      const response = data.text
      setHistory(items => [...items, { role: 'JARVIS', text: response, time: now() }])
      setMessage(data.scannedWords?.length ? `Learned vocabulary: ${data.scannedWords.join(', ')}.` : 'Processing complete.')
      speak(response)
    } catch (error) {
      const response = error.message || 'Connection to the AI core failed.'
      setHistory(items => [...items, { role: 'JARVIS', text: response, time: now() }])
      setMessage('AI core unavailable.')
      speak(response)
    } finally {
      setThinking(false)
    }
  }

  const toggleListening = () => {
    if (!recognition.current) { setMessage('Speech recognition is not supported in this browser.'); return }
    const nextState = !alwaysListening
    setAlwaysListening(nextState)
    keepListening.current = nextState
    if (nextState) {
      try { recognition.current.start() } catch { /* It may already be listening. */ }
    } else recognition.current.stop()
  }

  return <main className="app-shell">
    <div className="scanlines" />
    <header>
      <div className="brand"><span className="brand-mark">J</span><div><strong>JARVIS</strong><small>PERSONAL AI INTERFACE</small></div></div>
      <div className="system-status"><i /><span>SYSTEMS ONLINE</span><b>{now()}</b></div>
    </header>

    <section className="hero">
      <div className="side-label left">VOICE<br/>ASSISTANT<br/><em>V.01</em></div>
      <div className="orb-wrap" aria-label="Jarvis voice assistant">
        <div className={`orbit orbit-one ${listening ? 'active' : ''}`} />
        <div className={`orbit orbit-two ${speaking ? 'speaking' : ''}`} />
        <div className={`orb ${listening ? 'listening' : ''} ${speaking ? 'speaking' : ''}`}>
          <div className="orb-core"><span>{listening ? 'LISTENING' : speaking ? 'SPEAKING' : thinking ? 'THINKING' : 'JARVIS'}</span></div>
        </div>
        <div className="radar r1" /><div className="radar r2" /><div className="radar r3" />
      </div>
      <div className="side-label right"><span>NEURAL LINK</span><strong>CONNECTED</strong><div className="bars">||||||||</div></div>
    </section>

    <p className="state-message">{message}</p>
    <section className="command-panel">
      <button className={`mic ${listening ? 'recording' : ''}`} onClick={toggleListening} aria-label="Toggle always-listening microphone" title={alwaysListening ? 'Turn off always listening' : 'Turn on always listening'}><span>{alwaysListening ? '⌁' : '○'}</span></button>
      <div className="input-wrap"><input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Type, say, or research a topic..." /><kbd>ENTER</kbd></div>
      <button className="send" disabled={thinking} onClick={() => submit()} aria-label="Send command">{thinking ? '…' : '↗'}</button>
    </section>

    <section className="lower-grid">
      <div className="module conversation"><div className="module-title"><span>CONVERSATION LOG</span><b>LIVE</b></div><div className="log">{history.length ? history.slice(-4).map((item, i) => <div className={item.role === 'JARVIS' ? 'reply' : ''} key={i}><span>{item.role} <i>{item.time}</i></span><p>{item.text}</p></div>) : <div className="empty">Awaiting your first command...</div>}</div></div>
      <div className="module controls"><div className="module-title"><span>VOICE CONTROL</span></div><button className={`mute ${muted ? 'off' : ''}`} onClick={() => { setMuted(!muted); if (!muted) window.speechSynthesis?.cancel() }}><span>{muted ? '◯' : '◉'}</span><div><small>VOICE OUTPUT</small><strong>{muted ? 'MUTED' : 'ENABLED'}</strong></div></button><button className={`mute ${dictionaryMode ? '' : 'off'}`} onClick={() => setDictionaryMode(value => !value)}><span>{dictionaryMode ? '◉' : '◯'}</span><div><small>DICTIONARY LEARNING</small><strong>{dictionaryMode ? 'ENABLED' : 'DISABLED'}</strong></div></button><div className="hint">ALWAYS LISTENING: {alwaysListening ? 'ON' : 'OFF'}<br/>SPEECH-TO-TEXT READY</div></div>
    </section>
    <footer><span>JARVIS CORE / LOCAL INTERFACE</span><span>SECURE CHANNEL · 256-BIT</span></footer>
  </main>
}
