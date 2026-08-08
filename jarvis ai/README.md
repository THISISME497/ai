# JARVIS voice assistant

This app uses the OpenAI Responses API through a local server, keeping your API key out of the browser.

Without an API key, Jarvis still works using its editable local response library at `data/response-library.json`. It includes 108 knowledge answers expanded into 4,320 conversational answer variations, and more than 5,000 recognized offline question/command phrasings. Add an entry with `keywords` and an `answer` to teach it more offline responses.

Jarvis attempts to begin continuous speech recognition after microphone permission is granted. You can turn always-listening mode off using the round microphone control.

## Web research

Say or type `research renewable energy`, `look up black holes`, or `search the web for space weather`. Jarvis retrieves a concise public web result and saves each research item in MongoDB's `research` collection when MongoDB is configured. This builds a searchable research record; it does not retrain an AI model.

## Optional MongoDB response database

Set `MONGODB_URI` to your MongoDB Atlas or local MongoDB connection string, and optionally set `MONGODB_DB` (defaults to `jarvis`). On its first connection, Jarvis copies the built-in response library into the `responses` collection. It then reads responses from MongoDB whenever it is available; if it cannot connect, it safely falls back to the local JSON file.

```powershell
$env:MONGODB_URI = "your-mongodb-connection-string"
$env:MONGODB_DB = "jarvis"
.\Start-Jarvis.bat
```

## One-time setup

1. Install the current Node.js LTS from https://nodejs.org/ (this provides `node`, `npm`, and `npx`). Restart PowerShell afterwards.
2. In this folder run: `npm install`
3. Create an OpenAI API key at https://platform.openai.com/api-keys.

## Run on Windows PowerShell

The easiest option in this Codex workspace is to double-click `Start-Jarvis.bat`, or run this command in PowerShell:

```powershell
.\Start-Jarvis.bat
```

Otherwise, after installing Node.js LTS, use the standard command below.

From the project folder, set the key for the current terminal and start the app:

```powershell
$env:OPENAI_API_KEY = "paste-your-key-here"
npm start
```

Open http://localhost:5190. Keep the PowerShell window open while using Jarvis.

Use `npm start`, not `npm run dev`: `start` launches both the interface and Jarvis's local response/API server.

## Web research memory

Say or type `research renewable energy`, `look up black holes`, or `search the web for space weather`. Jarvis saves a concise result in MongoDB's `research` collection and learns 36 follow-up phrases for that topic, including `tell me about ...`, `what is ...`, and `explain ...`. Later, ask about that topic normally and Jarvis will look through its saved research before using ordinary local responses. Unknown factual questions such as `why is renewable energy important` are researched and saved automatically. This is stored research memory, not model training.

## Dictionary Learning mode

Turn on **Dictionary Learning** in the interface to scan every completed sentence you say or type. Jarvis learns up to four unfamiliar words per sentence, including definitions, synonyms, and examples. It saves those records in MongoDB's `dictionary` collection and saves each scanned sentence in `phrase_memory`. You can also always say `define resilient` or `what does resilient mean`.

## Math

Say or type `calculate 12 times (4 plus 3)`, `what is 80 divided by 5`, or `2.5 * 8`. Jarvis supports `+`, `-`, `*`, `/`, `%`, powers (`^`), decimals, and parentheses.

Never put your key in `src/App.jsx` or commit it to Git.

## Deploy to Render

1. Push this project to a private GitHub repository.
2. In Render, choose **New → Blueprint**, select the repository, and approve the `render.yaml` configuration.
3. In Render's environment-variable settings, add `MONGODB_URI` with your MongoDB Atlas connection string. Keep it marked as a secret. `MONGODB_DB` is already set to `jarvis`.
4. Optionally add `OPENAI_API_KEY` for model-powered answers. The local response, research, and dictionary features work without it.
5. Deploy. Render provides an HTTPS URL; use that URL instead of `localhost:5190`.

For MongoDB Atlas, allow Render to connect by configuring its Network Access rules appropriately. Never commit credentials or put them in `render.yaml`.
