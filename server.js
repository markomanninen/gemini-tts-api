const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const wav = require('wav');
const cors = require('cors');
require('dotenv').config();

// Model configurations from environment variables or defaults
const TTS_MODEL = process.env.TTS_MODEL_NAME || 'gemini-2.5-flash-preview-tts';
const ORCHESTRATOR_MODEL = process.env.ORCHESTRATOR_MODEL_NAME || 'gemini-2.5-flash-preview-05-20';
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL_NAME || 'gemini-2.5-pro-preview-05-06';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

let genAI;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log(`AI Service Initialized. Models in use:
    TTS: ${TTS_MODEL}
    Orchestrator: ${ORCHESTRATOR_MODEL}
    Transcription: ${TRANSCRIPTION_MODEL}`);
} else {
    console.error("FATAL ERROR: GEMINI_API_KEY is not defined or is still the default in the .env file.");
    console.error("The application cannot make API calls without a valid API key.");
    // Not exiting here to allow server to start for non-API routes, but API calls will fail.
}

const VOICES = [
    'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
    'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
    'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
    'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
    'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat'
];

const sessions = new Map();

async function saveWaveFile(filename, pcmData, channels = 1, rate = 24000, sampleWidth = 2) {
    return new Promise((resolve, reject) => {
        const writer = new wav.FileWriter(filename, {
            channels,
            sampleRate: rate,
            bitDepth: sampleWidth * 8,
        });
        writer.on('finish', resolve);
        writer.on('error', reject);
        const bufferData = Buffer.isBuffer(pcmData) ? pcmData : Buffer.from(pcmData);
        writer.write(bufferData);
        writer.end();
    });
}

async function createSessionDirectory(sessionId) {
    const sessionDir = path.join(__dirname, 'sessions', sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(path.join(sessionDir, 'audio'), { recursive: true });
    await fs.mkdir(path.join(sessionDir, 'transcripts'), { recursive: true });
    await fs.mkdir(path.join(sessionDir, 'prompts'), { recursive: true });
    return sessionDir;
}

async function saveSessionData(sessionId, type, filename, content) {
    const session = sessions.get(sessionId);
    if (!session || !session.directory) {
        console.warn(`Session or directory for ${sessionId} not found in map, attempting to use/create path.`);
        const sessionDir = path.join(__dirname, 'sessions', sessionId);
        await fs.mkdir(path.join(sessionDir, type), { recursive: true }).catch(err => {
            // If directory already exists, fine, otherwise log error.
            if (err.code !== 'EEXIST') console.error(`Error ensuring directory for save: ${err.message}`);
        });
        if(session && !session.directory) session.directory = sessionDir;
        else if (!session) { // If session truly gone from map
             const constructedPath = path.join(sessionDir, type, filename);
             if (type === 'audio') await fs.writeFile(constructedPath, content);
             else await fs.writeFile(constructedPath, JSON.stringify(content, null, 2));
             return constructedPath;
        }
    }

    const filePath = path.join(session.directory, type, filename);
    if (type === 'audio') {
        await fs.writeFile(filePath, content);
    } else {
        const contentToWrite = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        await fs.writeFile(filePath, contentToWrite);
    }
    return filePath;
}

app.post('/api/session', async (req, res) => {
    try {
        const sessionId = uuidv4();
        const sessionDir = await createSessionDirectory(sessionId);
        sessions.set(sessionId, {
            id: sessionId,
            directory: sessionDir,
            created: new Date(),
            files: { audio: [], transcripts: [], prompts: [] }
        });
        res.json({ success: true, sessionId, message: 'Session created successfully' });
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({ success: false, error: 'Failed to create session: ' + error.message });
    }
});

app.get('/api/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = sessions.get(sessionId);
        if (!session) {
            return res.status(404).json({ success: false, error: 'Session not found' });
        }
        res.json({
            success: true,
            session: { id: session.id, created: session.created, files: session.files }
        });
    } catch (error) {
        console.error(`Error getting session info for ${req.params.sessionId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Internal handler for transcript generation logic
app.handleGenerateTranscript = async (params) => {
    const { sessionId, prompt, speakers = [], style = 'conversation' } = params;
    if (!genAI) throw new Error("AI Service not initialized. Check GEMINI_API_KEY.");

    const model = genAI.getGenerativeModel({ model: TRANSCRIPTION_MODEL });
    let transcriptPrompt = prompt;
    if (speakers.length > 0) {
        const speakersText = speakers.join(' and ');
        transcriptPrompt = `Generate a ${style} transcript with speakers: ${speakersText}. ${prompt}`;
    }

    const timestamp = Date.now();
    const userPromptFileName = `prompt_transcript_user_${timestamp}.json`;
    const promptData = { originalUserPrompt: prompt, fullGeneratedPromptForAI: transcriptPrompt, requestedSpeakers: speakers, requestedStyle: style, timestamp: new Date() };

    await saveSessionData(sessionId, 'prompts', userPromptFileName, promptData);

    const result = await model.generateContent(transcriptPrompt);
    const transcript = result.response.text();
    const generatedTranscriptFileName = `transcript_generated_${timestamp}.json`;
    const transcriptData = { content: transcript, sourcePromptFile: userPromptFileName, timestamp: new Date() };

    await saveSessionData(sessionId, 'transcripts', generatedTranscriptFileName, transcriptData);

    const session = sessions.get(sessionId);
    session.files.prompts.push(userPromptFileName);
    session.files.transcripts.push(generatedTranscriptFileName);

    return { success: true, transcript, files: { prompt: userPromptFileName, transcript: generatedTranscriptFileName } };
};

app.post('/api/generate-transcript', async (req, res) => {
    try {
        const { sessionId, prompt } = req.body;
        if (!sessionId || !sessions.has(sessionId)) {
            return res.status(400).json({ success: false, error: 'Valid session ID required' });
        }
        if (!prompt) {
            return res.status(400).json({ success: false, error: 'Prompt is required' });
        }
        const result = await app.handleGenerateTranscript(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/generate-transcript route:', error);
        res.status(500).json({ success: false, error: 'Failed to generate transcript: ' + error.message });
    }
});

// Internal handler for single speaker TTS logic
app.handleSingleTTS = async (params) => {
    const { sessionId, text, voice = 'Kore', style } = params;
    if (!genAI) throw new Error("AI Service not initialized. Check GEMINI_API_KEY.");

    const styledText = style ? `${style}: ${text}` : text;
    const ttsModel = genAI.getGenerativeModel({ model: TTS_MODEL });
    const ttsResponse = await ttsModel.generateContent({
        contents: [{ parts: [{ text: styledText }] }],
        generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        }
    });
    const audioData = ttsResponse.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
        console.error("Single TTS API Response dump:", JSON.stringify(ttsResponse.response, null, 2));
        throw new Error('No audio data received from single TTS API');
    }
    const audioBuffer = Buffer.from(audioData, 'base64');

    const timestamp = Date.now();
    const audioFileName = `single_${voice.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.wav`;
    const audioFilePath = path.join(sessions.get(sessionId).directory, 'audio', audioFileName);
    await saveWaveFile(audioFilePath, audioBuffer);
    sessions.get(sessionId).files.audio.push(audioFileName);
    return { success: true, audioFile: audioFileName, voice, text: styledText, audioUrl: `/api/audio/${sessionId}/${audioFileName}` };
};

app.post('/api/tts/single', async (req, res) => {
    try {
        const { sessionId, text, voice } = req.body;
        if (!sessionId || !sessions.has(sessionId)) {
            return res.status(400).json({ success: false, error: 'Valid session ID required' });
        }
        if (!text) {
            return res.status(400).json({ success: false, error: 'Text is required' });
        }
        if (voice && !VOICES.includes(voice)) {
            return res.status(400).json({ success: false, error: `Invalid voice. Available voices: ${VOICES.join(', ')}` });
        }
        const result = await app.handleSingleTTS(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/tts/single route:', error);
        res.status(500).json({ success: false, error: 'Failed in single speaker TTS: ' + error.message });
    }
});

// Internal handler for multi-speaker TTS logic
app.handleMultiTTS = async (params) => {
    const { sessionId, text, speakers } = params;
    if (!genAI) throw new Error("AI Service not initialized. Check GEMINI_API_KEY.");

    const ttsModel = genAI.getGenerativeModel({ model: TTS_MODEL });
    const speakerVoiceConfigs = speakers.map(sp => ({
        speaker: sp.name,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: sp.voice } }
    }));
    const ttsResponse = await ttsModel.generateContent({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } }
        }
    });
    const audioData = ttsResponse.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
        console.error("Multi-TTS API Response dump:", JSON.stringify(ttsResponse.response, null, 2));
        throw new Error('No audio data received from multi-speaker TTS API');
    }
    const audioBuffer = Buffer.from(audioData, 'base64');
    const timestamp = Date.now();
    const audioFileName = `multi_${speakers.map(s=>s.name.replace(/[^a-z0-9]/gi, '_')).join('_')}_${timestamp}.wav`;
    const audioFilePath = path.join(sessions.get(sessionId).directory, 'audio', audioFileName);
    await saveWaveFile(audioFilePath, audioBuffer);
    sessions.get(sessionId).files.audio.push(audioFileName);
    return { success: true, audioFile: audioFileName, speakers, text, audioUrl: `/api/audio/${sessionId}/${audioFileName}` };
};

app.post('/api/tts/multi', async (req, res) => {
    try {
        const { sessionId, text, speakers } = req.body;
        if (!sessionId || !sessions.has(sessionId)) {
            return res.status(400).json({ success: false, error: 'Valid session ID required' });
        }
        if (!text || !speakers || !Array.isArray(speakers) || speakers.length === 0) {
            return res.status(400).json({ success: false, error: 'Text and speakers array are required' });
        }
        if (speakers.length > 2) {
            return res.status(400).json({ success: false, error: 'Maximum 2 speakers supported' });
        }
        for (const speaker of speakers) {
            if (!VOICES.includes(speaker.voice)) {
                return res.status(400).json({ success: false, error: `Invalid voice "${speaker.voice}" for speaker "${speaker.name}"` });
            }
            if(!speaker.name || typeof speaker.name !== 'string' || speaker.name.trim() === '') {
                return res.status(400).json({ success: false, error: `Speaker name is required and must be a non-empty string for voice ${speaker.voice}.` });
            }
        }
        const result = await app.handleMultiTTS(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/tts/multi route:', error);
        res.status(500).json({ success: false, error: 'Failed in multi-speaker TTS: ' + error.message });
    }
});

app.post('/api/ai-driven-generation', async (req, res) => {
    if (!genAI) return res.status(503).json({ success: false, error: "AI Service not initialized. Check GEMINI_API_KEY." });
    try {
        const { sessionId, userPrompt } = req.body;

        if (!sessionId || !sessions.has(sessionId)) {
            return res.status(400).json({ success: false, error: 'Valid session ID required' });
        }
        if (!userPrompt) {
            return res.status(400).json({ success: false, error: 'User prompt is required' });
        }

        const orchestratorGenModel = genAI.getGenerativeModel({ model: ORCHESTRATOR_MODEL });
        const voiceDetailsForPrompt = `Available voices: ${JSON.stringify(VOICES)}. Max 2 speakers for multi-speaker.`;
        const metaPrompt = `
You are an AI assistant that plans text-to-speech (TTS) tasks. Based on the user's prompt, generate a JSON object defining the actions and parameters.
${voiceDetailsForPrompt}
Output MUST be a single valid JSON object with this structure:
{
  "taskType": "single_tts" | "multi_tts_direct" | "generate_script_then_tts",
  "scriptToGeneratePrompt": "If 'generate_script_then_tts', the detailed prompt for script generation. Else null.",
  "scriptSpeakers": ["SpeakerName1", "SpeakerName2"],
  "scriptStyle": "e.g., podcast, dialogue.",
  "fullTextForTTS": "The complete text for TTS. For 'generate_script_then_tts', this can be a placeholder like 'Script to be generated'.",
  "singleSpeakerVoice": "VoiceName",
  "singleSpeakerStyle": "e.g., cheerfully",
  "multiSpeakerConfig": [ {"name": "SpeakerNameInScript", "voice": "VoiceName"} ]
}
Guidelines:
1. User Prompt: "${userPrompt}"
2. Analyze prompt for taskType.
   a. "single_tts": User provides text for one voice. 'fullTextForTTS' is user's text. Choose 'singleSpeakerVoice', optional 'singleSpeakerStyle'.
   b. "multi_tts_direct": User provides text with speaker labels (e.g., "Tom: Hi."). 'fullTextForTTS' is user's text. Populate 'multiSpeakerConfig'.
   c. "generate_script_then_tts": User asks to create content. Formulate 'scriptToGeneratePrompt', define 'scriptSpeakers' (1-2), 'scriptStyle'. Set 'multiSpeakerConfig'.
3. Voice Selection: Choose from available voices. Match user descriptions. Ensure valid.
4. Speaker Names: For generated scripts, if names aren't in prompt, create logical names.
5. Max 2 speakers for multi-speaker.
Respond ONLY with the JSON object.
`;

        const orchestratorResult = await orchestratorGenModel.generateContent(metaPrompt);
        const planJsonString = orchestratorResult.response.text().replace(/^```json\s*|```$/g, "").trim();
        let plan;
        try {
            plan = JSON.parse(planJsonString);
        } catch (e) {
            console.error("Error parsing JSON from AI orchestrator:", planJsonString, e);
            return res.status(500).json({ success: false, error: "Failed to parse plan from AI orchestrator.", details: e.message, rawResponse: planJsonString });
        }

        const planFileName = `ai_plan_${Date.now()}.json`;
        await saveSessionData(sessionId, 'prompts', planFileName, { userPrompt, generatedPlan: plan, rawOrchestratorResponse: planJsonString });
        sessions.get(sessionId).files.prompts.push(planFileName);

        let finalResult = { aiPlan: plan };
        let generatedScriptText = null;

        switch (plan.taskType) {
            case 'single_tts':
                if (!plan.fullTextForTTS || !plan.singleSpeakerVoice) {
                    return res.status(400).json({ success: false, error: "AI Plan Error: Missing text or voice for single_tts.", plan });
                }
                const singleRes = await app.handleSingleTTS({ sessionId, text: plan.fullTextForTTS, voice: plan.singleSpeakerVoice, style: plan.singleSpeakerStyle });
                if (!singleRes.success) throw new Error(singleRes.error || "Single TTS failed within AI flow");
                finalResult = { ...finalResult, ...singleRes };
                break;
            case 'multi_tts_direct':
                if (!plan.fullTextForTTS || !plan.multiSpeakerConfig || plan.multiSpeakerConfig.length === 0) {
                    return res.status(400).json({ success: false, error: "AI Plan Error: Missing text or speakers for multi_tts_direct.", plan });
                }
                const multiDirectRes = await app.handleMultiTTS({ sessionId, text: plan.fullTextForTTS, speakers: plan.multiSpeakerConfig });
                if (!multiDirectRes.success) throw new Error(multiDirectRes.error || "Multi TTS Direct failed");
                finalResult = { ...finalResult, ...multiDirectRes };
                break;
            case 'generate_script_then_tts':
                if (!plan.scriptToGeneratePrompt || !plan.scriptSpeakers || plan.scriptSpeakers.length === 0 || !plan.multiSpeakerConfig || plan.multiSpeakerConfig.length === 0) {
                    return res.status(400).json({ success: false, error: "AI Plan Error: Missing script prompt, speakers, or TTS config for script generation flow.", plan });
                }
                const scriptGenRes = await app.handleGenerateTranscript({ sessionId, prompt: plan.scriptToGeneratePrompt, speakers: plan.scriptSpeakers, style: plan.scriptStyle || 'conversation' });
                if (!scriptGenRes.success) throw new Error(scriptGenRes.error || "Script generation failed");
                generatedScriptText = scriptGenRes.transcript;
                finalResult.generatedScript = generatedScriptText;
                finalResult.scriptFiles = scriptGenRes.files;

                const multiFromScriptRes = await app.handleMultiTTS({ sessionId, text: generatedScriptText, speakers: plan.multiSpeakerConfig });
                if (!multiFromScriptRes.success) throw new Error(multiFromScriptRes.error || "Multi TTS from script failed");
                finalResult = { ...finalResult, ...multiFromScriptRes };
                break;
            default:
                return res.status(400).json({ success: false, error: `AI Plan Error: Unknown task_type '${plan.taskType}'`, plan });
        }
        res.json({ success: true, message: 'AI-driven generation successful.', ...finalResult });
    } catch (error) {
        console.error('Error in /api/ai-driven-generation route:', error);
        res.status(500).json({ success: false, error: error.message, details: error.stack });
    }
});

app.get('/api/audio/:sessionId/:filename', async (req, res) => {
    try {
        const { sessionId, filename } = req.params;
        const session = sessions.get(sessionId);
        let audioPath;

        if (session && session.directory) {
            audioPath = path.join(session.directory, 'audio', filename);
        } else {
            const potentialPath = path.join(__dirname, 'sessions', sessionId, 'audio', filename);
            try {
                await fs.access(potentialPath);
                audioPath = potentialPath;
            } catch {
                return res.status(404).json({ success: false, error: 'Session or audio file not found' });
            }
        }
        await fs.access(audioPath);
        res.setHeader('Content-Type', 'audio/wav');
        res.sendFile(path.resolve(audioPath));
    } catch (error) {
        if (error.code === 'ENOENT') res.status(404).json({ success: false, error: 'Audio file not found' });
        else {
            console.error(`Error serving audio file ${req.params.filename}:`, error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

app.get('/api/session/:sessionId/files', async (req, res) => {
    try {
        const { sessionId } = req.params;
        let sessionDir;
        const sessionFromMap = sessions.get(sessionId);

        if (sessionFromMap && sessionFromMap.directory) {
            sessionDir = sessionFromMap.directory;
        } else {
            sessionDir = path.join(__dirname, 'sessions', sessionId);
            try { await fs.access(sessionDir); }
            catch { return res.status(404).json({ success: false, error: 'Session not found or directory inaccessible' });}
        }

        const files = { audio: [], transcripts: [], prompts: [] };
        for (const type of ['audio', 'transcripts', 'prompts']) {
            const typeDir = path.join(sessionDir, type);
            try {
                const fileList = await fs.readdir(typeDir);
                for (const file of fileList) {
                    if (type === 'audio' && !file.endsWith('.wav')) continue;
                    if ((type === 'transcripts' || type === 'prompts') && !file.endsWith('.json')) continue;
                    const filePath = path.join(typeDir, file);
                    const stats = await fs.stat(filePath);
                    files[type].push({
                        name: file, size: stats.size, created: stats.birthtime,
                        url: (type === 'audio') ? `/api/audio/${sessionId}/${file}` : `/api/file/${sessionId}/${type}/${file}`
                    });
                }
            } catch (error) {
                if (error.code !== 'ENOENT') console.warn(`Warning: Could not read directory ${typeDir}: ${error.message}`);
            }
        }
        res.json({ success: true, files });
    } catch (error) {
        console.error(`Error listing files for session ${req.params.sessionId}:`, error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/file/:sessionId/:type/:filename', async (req, res) => {
    try {
        const { sessionId, type, filename } = req.params;
        if (!['transcripts', 'prompts'].includes(type)) {
            return res.status(400).json({ success: false, error: 'Invalid file type specified' });
        }
        let sessionDir;
        const session = sessions.get(sessionId);
        if (session && session.directory) sessionDir = session.directory;
        else {
            sessionDir = path.join(__dirname, 'sessions', sessionId);
            try { await fs.access(sessionDir); }
            catch { return res.status(404).json({ success: false, error: 'Session directory not found' }); }
        }
        const filePath = path.join(sessionDir, type, filename);
        await fs.access(filePath);
        const content = await fs.readFile(filePath, 'utf8');
        res.setHeader('Content-Type', 'application/json');
        res.send(content);
    } catch (error) {
        if (error.code === 'ENOENT') res.status(404).json({ success: false, error: 'File not found' });
        else {
            console.error(`Error serving file ${req.params.type}/${req.params.filename}:`, error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

app.get('/api/voices', (req, res) => {
    res.json({ success: true, voices: VOICES });
});

app.get('/health', (req, res) => {
    res.json({
        success: true, message: 'Gemini TTS API is running', timestamp: new Date(),
        sessions: sessions.size,
        modelsInUse: { TTS_MODEL, ORCHESTRATOR_MODEL, TRANSCRIPTION_MODEL },
        geminiService: genAI ? "Initialized" : "Not Initialized (GEMINI_API_KEY missing or default)"
    });
});

app.use((error, req, res, next) => {
    console.error('Unhandled Error:', error.stack || error.message || error);
    res.status(500).json({ success: false, error: 'Internal Server Error. Please check server logs.' });
});

if (require.main === module) {
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
        console.error("--------------------------------------------------------------------");
        console.error("🔴 FATAL: GEMINI_API_KEY is not set or is default in your .env file!");
        console.error("The application requires this key for Google Gemini services.");
        console.error("Please create/update .env with your valid key.");
        console.error("Exiting. Server will not start.");
        console.error("--------------------------------------------------------------------");
        process.exit(1);
    }
    app.listen(PORT, () => {
        console.log(`🎤 Gemini TTS API Server running on port ${PORT}`);
        console.log(`📁 Sessions stored in: ${path.join(__dirname, 'sessions')}`);
        console.log(`🔑 GEMINI_API_KEY is loaded.`);
        console.log(`✨ Models: TTS='${TTS_MODEL}', Orchestrator='${ORCHESTRATOR_MODEL}', Transcription='${TRANSCRIPTION_MODEL}'`);
        console.log(`🔗 Test client: http://localhost:${PORT}/test-client.html`);
    });
}

module.exports = app;