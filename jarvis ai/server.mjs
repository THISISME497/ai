import express from 'express'
import OpenAI from 'openai'
import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { evaluate } from 'mathjs'

const responseLibrary = JSON.parse(readFileSync(new URL('./data/response-library.json', import.meta.url), 'utf8'))
const phraseStarters = [
  'jarvis', 'hey jarvis', 'jarvis please', 'please', 'can you', 'could you',
  'would you', 'i need you to', 'i want to', 'help me', 'tell me',
  'can you please', 'right now', 'for me', 'quickly', 'kindly', 'please jarvis',
  'hey can you', 'i was wondering', 'i would like to', 'can i ask you to',
  'would it be possible to', 'i need help with', 'i need information about',
  'help me understand', 'give me help with', 'can you tell me', 'can you explain',
  'i want information about', 'i want to know about', 'let me know about',
  'i am curious about', 'could you please', 'would you please', 'jarvis can you',
  'jarvis could you', 'jarvis would you', 'assistant please', 'hey assistant',
  'please help me with', 'i need an answer about', 'give me an answer about',
  'tell me something about', 'i have a question about', 'answer this about',
  'help with', 'more information about', 'explain this about', 'can you help me with',
  'i would appreciate help with', 'i need to learn about', 'i want to learn about',
  'i am trying to understand', 'please explain', 'could you help with',
  'would you help with', 'jarvis help me with', 'quick question about',
  'one question about', 'can we talk about'
]
const answerFrames = [
  answer => answer,
  answer => `Certainly. ${answer}`,
  answer => `Of course. ${answer}`,
  answer => `Here is what I can tell you: ${answer}`,
  answer => `Understood. ${answer}`,
  answer => `Yes. ${answer}`,
  answer => `Absolutely. ${answer}`,
  answer => `Here is a helpful answer: ${answer}`,
  answer => `In short, ${answer}`,
  answer => `The key point is this: ${answer}`,
  answer => `A useful way to think about it is this: ${answer}`,
  answer => `From my local knowledge: ${answer}`,
  answer => `I can help with that. ${answer}`,
  answer => `Let us break it down. ${answer}`,
  answer => `Here is the practical answer: ${answer}`,
  answer => `For now, ${answer}`,
  answer => `That is a good question. ${answer}`,
  answer => `Here is the clearest response I have: ${answer}`,
  answer => `I would suggest this: ${answer}`,
  answer => `A quick answer: ${answer}`,
  answer => `The straightforward answer is: ${answer}`,
  answer => `Keeping it simple: ${answer}`,
  answer => `My recommendation: ${answer}`,
  answer => `Here is a useful starting point: ${answer}`,
  answer => `I am ready to help. ${answer}`,
  answer => `Good question. ${answer}`,
  answer => `Here is the important part: ${answer}`,
  answer => `In practical terms, ${answer}`,
  answer => `Let us start here: ${answer}`,
  answer => `One useful response is: ${answer}`,
  answer => `I can give you this answer: ${answer}`,
  answer => `The main idea is: ${answer}`,
  answer => `Here is the best local answer I have: ${answer}`,
  answer => `I can respond to that: ${answer}`,
  answer => `A concise answer: ${answer}`,
  answer => `Here is what matters: ${answer}`,
  answer => `That makes sense. ${answer}`,
  answer => `I can guide you here. ${answer}`,
  answer => `The useful next step is this: ${answer}`,
  answer => `Let me help with that: ${answer}`,
]
const expandedResponses = responseLibrary.responses.map(entry => ({
  ...entry,
  keywords: [...new Set([...entry.keywords, ...phraseStarters.map(starter => `${starter} ${entry.keywords[0]}`)])],
  answerVariants: answerFrames.map(frame => frame(entry.answer)),
}))
let mongoClient
let responseCollection

async function getResponseCollection() {
  if (!process.env.MONGODB_URI) return null
  if (responseCollection) return responseCollection

  mongoClient = new MongoClient(process.env.'mongodb+srv://danyilfedynetsalt_db_user:aTk8RLWVSkmmXy3I@logins.tp8lgjh.mongodb.net/?appName=logins')
  await mongoClient.connect()
  responseCollection = mongoClient.db(process.env.MONGODB_DB || 'jarvis').collection('responses')
  await responseCollection.createIndex({ keywords: 1 })
  await responseCollection.bulkWrite(
    expandedResponses.map(entry => ({
      updateOne: {
        filter: { answer: entry.answer },
        update: { $set: entry },
        upsert: true,
      },
    }))
  )
  console.log('MongoDB response database connected.')
  return responseCollection
}

function getLocalResponse(message, entries = expandedResponses) {
  const prompt = message.toLowerCase()
  if (/\btime\b/.test(prompt)) return `It is currently ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
  const entry = entries.find(item => item.keywords.some(keyword => prompt.includes(keyword)))
  if (!entry) return responseLibrary.fallback
  const answers = entry.answerVariants?.length ? entry.answerVariants : [entry.answer]
  return answers[Math.floor(Math.random() * answers.length)]
}

async function getOfflineResponse(message) {
  try {
    const collection = await getResponseCollection()
    if (!collection) return getLocalResponse(message)
    const entries = await collection.find({}, { projection: { _id: 0, keywords: 1, answer: 1, answerVariants: 1 } }).toArray()
    return getLocalResponse(message, entries)
  } catch (error) {
    console.error('MongoDB unavailable; using local response library:', error.message)
    return getLocalResponse(message)
  }
}

async function findSavedResearch(message) {
  if (!process.env.MONGODB_URI) return null
  const ignored = new Set(['about', 'what', 'when', 'where', 'which', 'with', 'that', 'this', 'from', 'have', 'tell', 'show', 'give', 'does', 'your', 'their', 'they', 'them', 'would', 'could', 'should', 'please', 'jarvis', 'research', 'search', 'look', 'find', 'into'])
  const terms = [...new Set(message.toLowerCase().match(/[a-z0-9]{3,}/g)?.filter(word => !ignored.has(word)) || [])]
  if (!terms.length) return null

  try {
    await getResponseCollection()
    const records = await mongoClient.db(process.env.MONGODB_DB || 'jarvis').collection('research')
      .find({}, { projection: { topic: 1, summary: 1, phrases: 1, sourceUrl: 1, researchedAt: 1 } })
      .sort({ researchedAt: -1 }).limit(200).toArray()
    const ranked = records.map(record => {
      const searchable = `${record.topic} ${record.summary} ${(record.phrases || []).join(' ')}`.toLowerCase()
      const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0)
      return { record, score }
    }).sort((a, b) => b.score - a.score)
    return ranked[0]?.score ? ranked[0].record : null
  } catch (error) {
    console.error('Could not read saved research:', error.message)
    return null
  }
}

async function learnDictionaryWord(rawWord) {
  const word = String(rawWord || '').toLowerCase().replace(/[^a-z'-]/g, '')
  if (word.length < 2 || word.length > 64) return null
  const database = process.env.MONGODB_URI ? process.env.MONGODB_DB || 'jarvis' : null
  try {
    if (database) {
      await getResponseCollection()
      const saved = await mongoClient.db(database).collection('dictionary').findOne({ word })
      if (saved) return saved
    }

    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    if (!response.ok) return null
    const entries = await response.json()
    const entry = entries[0]
    const definitions = entry.meanings?.flatMap(meaning => meaning.definitions?.map(item => ({
      partOfSpeech: meaning.partOfSpeech,
      definition: item.definition,
      example: item.example || null,
    })) || []).slice(0, 3) || []
    if (!definitions.length) return null
    const synonyms = [...new Set(entry.meanings?.flatMap(meaning => [
      ...(meaning.synonyms || []),
      ...(meaning.definitions?.flatMap(item => item.synonyms || []) || []),
    ]) || [])].slice(0, 30)
    const examples = definitions.map(item => item.example).filter(Boolean)
    const learned = { word, phonetic: entry.phonetic || null, definitions, synonyms, examples, learnedAt: new Date() }
    if (database) await mongoClient.db(database).collection('dictionary').updateOne({ word }, { $set: learned }, { upsert: true })
    return learned
  } catch (error) {
    console.error('Dictionary lookup failed:', error.message)
    return null
  }
}

function dictionaryReply(entry) {
  const definitions = entry.definitions.map(item => `${item.partOfSpeech || 'definition'}: ${item.definition}`).join(' ')
  const example = entry.definitions.find(item => item.example)?.example
  return `${entry.word}${entry.phonetic ? `, pronounced ${entry.phonetic},` : ''} means: ${definitions}${example ? ` Example: ${example}` : ''}`
}

function extractLearnableWord(message) {
  const ignored = new Set(['about', 'could', 'would', 'should', 'jarvis', 'please', 'research', 'search', 'learn', 'define', 'meaning', 'dictionary', 'answer', 'question', 'something', 'anything'])
  return (message.toLowerCase().match(/[a-z]{4,}/g) || [])
    .filter(word => !ignored.has(word)).sort((a, b) => b.length - a.length)[0] || null
}

async function scanSentenceForLearning(message) {
  if (!process.env.MONGODB_URI) return []
  const ignored = new Set(['about', 'after', 'again', 'because', 'before', 'could', 'dictionary', 'every', 'from', 'have', 'into', 'jarvis', 'learn', 'meaning', 'please', 'research', 'sentence', 'should', 'that', 'their', 'there', 'these', 'thing', 'this', 'what', 'when', 'where', 'which', 'while', 'would', 'your'])
  const words = [...new Set((message.toLowerCase().match(/[a-z]{4,}/g) || []).filter(word => !ignored.has(word)))].slice(0, 4)
  const learned = []
  for (const word of words) {
    const entry = await learnDictionaryWord(word)
    if (entry) learned.push(entry.word)
  }
  await getResponseCollection()
  const phrase = message.trim().toLowerCase().replace(/\s+/g, ' ')
  if (phrase) {
    await mongoClient.db(process.env.MONGODB_DB || 'jarvis').collection('phrase_memory').updateOne(
      { phrase },
      { $set: { phrase, words: learned, lastSeenAt: new Date() }, $inc: { seenCount: 1 } },
      { upsert: true }
    )
  }
  return learned
}

function relatedTopics(items, results = []) {
  for (const item of items || []) {
    if (item.Text) results.push(item.Text)
    if (item.Topics) relatedTopics(item.Topics, results)
    if (results.length >= 3) break
  }
  return results
}

function researchPhrases(topic) {
  return [
    `tell me about ${topic}`, `what is ${topic}`, `explain ${topic}`,
    `teach me about ${topic}`, `give me information about ${topic}`,
    `what do you know about ${topic}`, `describe ${topic}`,
    `summarize ${topic}`, `facts about ${topic}`, `help me understand ${topic}`,
    `can you explain ${topic}`, `i want to learn about ${topic}`,
    `more about ${topic}`, `details about ${topic}`, `jarvis tell me about ${topic}`,
    `who is ${topic}`, `when did ${topic} happen`, `where is ${topic}`,
    `why is ${topic} important`, `how does ${topic} work`, `history of ${topic}`,
    `latest information on ${topic}`, `key facts about ${topic}`, `overview of ${topic}`,
    `research ${topic}`, `look up ${topic}`, `search for ${topic}`,
    `can you teach ${topic}`, `can you summarize ${topic}`, `i need facts on ${topic}`,
    `give me an overview of ${topic}`, `help with ${topic}`, `information on ${topic}`,
    `learn about ${topic}`, `knowledge about ${topic}`, `answer about ${topic}`,
  ]
}

async function researchAndLearn(topic) {
  const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(topic)}&format=json&no_html=1&skip_disambig=1`
  const searchResponse = await fetch(endpoint, { headers: { 'User-Agent': 'JarvisLocalResearch/1.0' } })
  if (!searchResponse.ok) throw new Error(`Search service returned ${searchResponse.status}.`)
  const result = await searchResponse.json()
  const details = [result.AbstractText, ...relatedTopics(result.RelatedTopics)].filter(Boolean)
  const summary = details.length ? details.join(' ') : `I could not find a concise result for “${topic}”. Try a more specific research topic.`
  const sourceUrl = result.AbstractURL || null
  const phrases = researchPhrases(topic)

  if (process.env.MONGODB_URI) {
    try {
      await getResponseCollection()
      await mongoClient.db(process.env.MONGODB_DB || 'jarvis').collection('research').insertOne({
        topic,
        summary,
        phrases,
        sourceUrl,
        researchedAt: new Date(),
      })
    } catch (error) {
      console.error('Could not save research to MongoDB:', error.message)
    }
  }
  return { summary, sourceUrl, phrases }
}

const app = express()
const port = Number(process.env.PORT || 5190)

app.use(express.json({ limit: '100kb' }))
app.use(express.static('dist'))

app.post('/api/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim()
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : []
  const dictionaryMode = Boolean(req.body?.dictionaryMode)
  if (!message) return res.status(400).json({ error: 'Please provide a message.' })
  let scannedWords = []
  if (dictionaryMode) {
    try { scannedWords = await scanSentenceForLearning(message) }
    catch (error) { console.error('Sentence scan failed:', error.message) }
  }
  const learned = await findSavedResearch(message)
  if (learned) {
    const sourceNote = learned.sourceUrl ? ` Source: ${learned.sourceUrl}` : ''
    return res.json({ text: `Based on my saved research about ${learned.topic}: ${learned.summary}${sourceNote}`, source: 'research-memory' })
  }
  if (!process.env.OPENAI_API_KEY) {
    const offline = await getOfflineResponse(message)
    const question = /^(?:what|who|when|where|why|how|tell me about|explain|define|is|are|can|could|should)\b/i.test(message)
    if (question && offline === responseLibrary.fallback) {
      try {
        const researched = await researchAndLearn(message)
        const sourceNote = researched.sourceUrl ? ` Source: ${researched.sourceUrl}` : ''
        return res.json({ text: `I researched that for you: ${researched.summary}${sourceNote}`, source: 'web-research' })
      } catch (error) {
        console.error('Automatic research failed:', error.message)
      }
    }
    if (dictionaryMode && offline === responseLibrary.fallback) {
      const learnedWord = await learnDictionaryWord(extractLearnableWord(message))
      if (learnedWord) return res.json({ text: dictionaryReply(learnedWord), source: 'dictionary-memory' })
    }
    return res.json({ text: offline, source: process.env.MONGODB_URI ? 'mongodb' : 'local', scannedWords })
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const input = [
      { role: 'developer', content: 'You are JARVIS, a concise, capable personal AI assistant. Be helpful, calm, and conversational. Do not claim to control devices or access data you do not have.' },
      ...history.map(item => ({ role: item.role === 'YOU' ? 'user' : 'assistant', content: item.text })),
      { role: 'user', content: message },
    ]
    const response = await client.responses.create({ model: 'gpt-5.6-terra', input })
    res.json({ text: response.output_text || 'I could not generate a response.' })
  } catch (error) {
    console.error('OpenAI request failed:', error.message)
    res.status(502).json({ error: 'The AI service could not complete that request. Check your API key and billing status.' })
  }
})

app.post('/api/dictionary', async (req, res) => {
  const entry = await learnDictionaryWord(req.body?.word)
  if (!entry) return res.status(404).json({ error: 'I could not find an English dictionary definition for that word.' })
  res.json({ text: dictionaryReply(entry), source: 'dictionary-memory' })
})

app.post('/api/research', async (req, res) => {
  const topic = String(req.body?.topic || '').trim()
  if (!topic) return res.status(400).json({ error: 'Tell me what you want to research.' })

  try {
    const researched = await researchAndLearn(topic)
    const sourceNote = researched.sourceUrl ? ` Source: ${researched.sourceUrl}` : ''
    res.json({ text: `Research on ${topic}: ${researched.summary}${sourceNote}`, sourceUrl: researched.sourceUrl })
  } catch (error) {
    console.error('Research request failed:', error.message)
    res.status(502).json({ error: 'Web research is unavailable right now. Check your internet connection and try again.' })
  }
})

app.post('/api/math', (req, res) => {
  const expression = String(req.body?.expression || '').trim()
  if (!expression) return res.status(400).json({ error: 'Give me a math expression to calculate.' })
  if (expression.length > 200 || !/^[0-9+\-*/^%().,\s]+$/.test(expression)) {
    return res.status(400).json({ error: 'Math mode supports numbers, parentheses, and the operators plus, minus, multiply, divide, power, and modulo.' })
  }
  try {
    const result = evaluate(expression)
    if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('Result is not finite')
    res.json({ text: `${expression} equals ${result}.`, result })
  } catch {
    res.status(400).json({ error: 'I could not calculate that expression. Check the numbers and operators.' })
  }
})

app.get('*splat', (_req, res) => res.sendFile('index.html', { root: 'dist' }))
app.listen(port, '0.0.0.0', () => {
  console.log(`Jarvis is running at http://localhost:${port}`)
  if (process.env.MONGODB_URI) {
    getResponseCollection()
      .then(() => console.log(`MongoDB is ready: ${process.env.MONGODB_DB || 'jarvis'}.responses`))
      .catch(error => console.error('MongoDB connection failed:', error.message))
  } else {
    console.log('MongoDB is not configured; using the local response library.')
  }
})

// Keep the local control/API process alive until the user closes its terminal.
process.stdin.resume()
