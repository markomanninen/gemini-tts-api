const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const wav = require('wav');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
require('dotenv').config();

const TTS_MODEL = process.env.TTS_MODEL_NAME || 'gemini-2.5-flash-preview-tts';
const ORCHESTRATOR_MODEL = process.env.ORCHESTRATOR_MODEL_NAME || 'gemini-2.5-flash-preview-05-20';
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL_NAME || 'gemini-2.5-pro-preview-05-06';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Increase server timeout for long-running AI operations
app.use((req, res, next) => {
    // Set timeout to 5 minutes for AI operations
    req.setTimeout(300000);
    res.setTimeout(300000);
    next();
});

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

    let transcript;
    try {
        console.log('Attempting to generate transcript with Gemini API...');
        const result = await model.generateContent(transcriptPrompt);
        transcript = result.response.text();
        console.log('Transcript generated successfully');
    } catch (apiError) {
        console.error('Gemini API Error:', apiError);
        if (apiError.message.includes('ENOTFOUND') || apiError.message.includes('ECONNREFUSED')) {
            throw new Error('Network connectivity issue. Please check your internet connection and try again.');
        } else if (apiError.message.includes('API_KEY_INVALID') || apiError.message.includes('401')) {
            throw new Error('Invalid API key. Please check your GEMINI_API_KEY in the .env file.');
        } else if (apiError.message.includes('quota') || apiError.message.includes('429')) {
            throw new Error('API quota exceeded. Please check your Gemini API usage limits.');
        } else {
            throw new Error(`Gemini API error: ${apiError.message}`);
        }
    }

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
        
        console.log(`Starting transcript generation for session ${sessionId}`);
        const result = await app.handleGenerateTranscript(req.body);
        console.log(`Transcript generation completed for session ${sessionId}`);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/generate-transcript route:', error);
        
        // Provide more specific error messages for common issues
        let errorMessage = error.message;
        if (error.message.includes('Network connectivity issue')) {
            errorMessage = 'Network connectivity issue. Please check your internet connection and try again.';
        } else if (error.message.includes('API_KEY_INVALID') || error.message.includes('Invalid API key')) {
            errorMessage = 'Invalid API key. Please check your GEMINI_API_KEY configuration.';
        } else if (error.message.includes('quota') || error.message.includes('429')) {
            errorMessage = 'API quota exceeded. Please check your Gemini API usage limits.';
        }
        
        res.status(500).json({ success: false, error: errorMessage });
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
    
    // Validate speakers array - Google TTS API requires exactly 2 speakers
    if (!speakers || !Array.isArray(speakers) || speakers.length !== 2) {
        throw new Error('Exactly 2 speakers required for multi-speaker TTS (Google API limitation)');
    }

    // Use the direct multi-speaker API for exactly 2 speakers
    const ttsModel = genAI.getGenerativeModel({ model: TTS_MODEL });
    const speakerVoiceConfigs = speakers.map(sp => ({
        speaker: sp.name,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: sp.voice } }
    }));
    
    // Add retry logic for API failures
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`TTS attempt ${attempt} for text: "${text.substring(0, 100)}..."`);
            const ttsResponse = await ttsModel.generateContent({
                contents: [{ parts: [{ text }] }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } }
                }
            });
            
            const response = ttsResponse.response;
            const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            
            if (!audioData) {
                const finishReason = response.candidates?.[0]?.finishReason;
                console.error(`Multi-TTS API Response (attempt ${attempt}):`, JSON.stringify(response, null, 2));
                
                if (finishReason === 'OTHER' || finishReason === 'SAFETY') {
                    // Try to clean the text and retry
                    if (attempt < 3) {
                        console.log(`Retrying with cleaned text (attempt ${attempt + 1})`);
                        // Clean the text by removing any potentially problematic characters
                        text = text.replace(/[^\w\s:.,!?-]/g, '').trim();
                        continue;
                    }
                    throw new Error(`TTS API refused to generate audio. Reason: ${finishReason}. This may be due to content policy restrictions.`);
                }
                
                if (attempt === 3) {
                    throw new Error('No audio data received from multi-speaker TTS API after 3 attempts');
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
            }
            
            const audioBuffer = Buffer.from(audioData, 'base64');
            const timestamp = Date.now();
            const audioFileName = `multi_${speakers.map(s=>s.name.replace(/[^a-z0-9]/gi, '_')).join('_')}_${timestamp}.wav`;
            const audioFilePath = path.join(sessions.get(sessionId).directory, 'audio', audioFileName);
            await saveWaveFile(audioFilePath, audioBuffer);
            sessions.get(sessionId).files.audio.push(audioFileName);
            return { success: true, audioFile: audioFileName, speakers, text, audioUrl: `/api/audio/${sessionId}/${audioFileName}` };
            
        } catch (error) {
            lastError = error;
            console.error(`TTS attempt ${attempt} failed:`, error.message);
            if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }
    
    throw lastError || new Error('Multi-speaker TTS failed after 3 attempts');
};

// Rename multi to duo for clarity
app.post('/api/tts/duo', async (req, res) => {
    try {
        const { sessionId, text, speakers } = req.body;
        if (!sessionId || !sessions.has(sessionId)) {
            return res.status(400).json({ success: false, error: 'Valid session ID required' });
        }
        if (!text || !speakers || !Array.isArray(speakers) || speakers.length === 0) {
            return res.status(400).json({ success: false, error: 'Text and speakers array are required' });
        }
        if (speakers.length !== 2) {
            return res.status(400).json({ success: false, error: 'Exactly 2 speakers required for duo TTS (Google API limitation)' });
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
        console.error('Error in /api/tts/duo route:', error);
        res.status(500).json({ success: false, error: 'Failed in duo speaker TTS: ' + error.message });
    }
});

// New conversation endpoint for handling 3+ speakers by intelligent segmentation
app.post('/api/tts/conversation', async (req, res) => {
    if (!genAI) return res.status(503).json({ success: false, error: "AI Service not initialized. Check GEMINI_API_KEY." });
    try {
        const { sessionId, text, speakers } = req.body;
        if (!sessionId || !sessions.has(sessionId)) {
            return res.status(400).json({ success: false, error: 'Valid session ID required' });
        }
        if (!text || !speakers || !Array.isArray(speakers) || speakers.length < 3) {
            return res.status(400).json({ success: false, error: 'Text and speakers array with at least 3 speakers are required for conversation TTS' });
        }
        for (const speaker of speakers) {
            if (!VOICES.includes(speaker.voice)) {
                return res.status(400).json({ success: false, error: `Invalid voice "${speaker.voice}" for speaker "${speaker.name}"` });
            }
            if(!speaker.name || typeof speaker.name !== 'string' || speaker.name.trim() === '') {
                return res.status(400).json({ success: false, error: `Speaker name is required and must be a non-empty string for voice ${speaker.voice}.` });
            }
        }
        
        // Check for duplicate speaker names
        const speakerNames = speakers.map(s => s.name.toLowerCase());
        const uniqueNames = new Set(speakerNames);
        if (uniqueNames.size !== speakerNames.length) {
            return res.status(400).json({ success: false, error: 'Speakers must have unique names. Found duplicate speaker names.' });
        }
        
        const result = await app.handleConversationTTS(req.body);
        res.json(result);
    } catch (error) {
        console.error('Error in /api/tts/conversation route:', error);
        res.status(500).json({ success: false, error: 'Failed in conversation TTS: ' + error.message });
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
        const voiceDetailsForPrompt = `Available voices: ${JSON.stringify(VOICES)}. Multi-speaker TTS requires exactly 2 speakers (Google API limitation).`;
        const metaPrompt = `
You are an AI assistant that plans text-to-speech (TTS) tasks. Based on the user's EXACT prompt, generate a JSON object defining the actions and parameters.

CRITICAL: You MUST analyze the USER'S ACTUAL REQUEST below, not generate unrelated content.

USER PROMPT TO ANALYZE: "${userPrompt}"

${voiceDetailsForPrompt}

COMPLETE TASK TYPE OPTIONS:
1. "single_tts_direct" - User provides ready text for single speaker
2. "single_tts_generate" - Generate script for single speaker 
3. "duo_tts_direct" - User provides ready text for exactly 2 speakers
4. "duo_tts_generate" - Generate script for exactly 2 speakers
5. "conversation_tts_direct" - User provides ready text for 3+ speakers
6. "conversation_tts_generate" - Generate script for 3+ speakers

ANALYSIS RULES:
1. Determine if user is providing TEXT or asking to GENERATE content:
   - Keywords like "Generate", "Create", "Write" = GENERATE
   - User provides actual dialogue/text = DIRECT

2. Count DISTINCT SPEAKING CHARACTERS:
   - Extract character names from user's prompt
   - If user provides text with "Name: dialogue", count speakers
   - Consider narrator as a speaking character if mentioned

3. Select taskType based on speaker count and content type:
   - 1 speaker + provided text = "single_tts_direct"
   - 1 speaker + generate request = "single_tts_generate"
   - 2 speakers + provided text = "duo_tts_direct"  
   - 2 speakers + generate request = "duo_tts_generate"
   - 3+ speakers + provided text = "conversation_tts_direct"
   - 3+ speakers + generate request = "conversation_tts_generate"

OUTPUT STRUCTURE:
{
  "taskType": "single_tts_direct|single_tts_generate|duo_tts_direct|duo_tts_generate|conversation_tts_direct|conversation_tts_generate",
  "scriptToGeneratePrompt": "User's exact request for generation, or null if direct",
  "scriptSpeakers": ["Exact character names from user's prompt"],
  "scriptStyle": "Style extracted from user's request",
  "fullTextForTTS": "User's provided text or 'Script to be generated'",
  "singleSpeakerVoice": "Voice for single speaker tasks",
  "singleSpeakerStyle": "Style for single speaker",
  "duoSpeakerConfig": [{"name": "Name", "voice": "Voice"}] for duo tasks,
  "conversationSpeakers": [{"name": "Name", "voice": "Voice"}] for conversation tasks
}

EXAMPLES:
- "Generate fairy tale with narrator, princess Luna, knight Sir Marcus, wizard Gandolf" 
  → conversation_tts_generate (4 speakers, generate content)
- "Create dialogue between Tom and Jane about weather"
  → duo_tts_generate (2 speakers, generate content)  
- "Read this: Tom: Hello. Jane: Hi there."
  → duo_tts_direct (2 speakers, text provided)
- "Generate a podcast intro about science"
  → single_tts_generate (1 speaker, generate content)
- "Read this story: Once upon a time..."
  → single_tts_direct (1 speaker, text provided)

VOICE ASSIGNMENT: Choose from ${VOICES.join(', ')} matching character descriptions.

Respond ONLY with the JSON object for the USER'S EXACT REQUEST.
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
            case 'single_tts_direct':
                // User provides ready text for single speaker
                if (!plan.fullTextForTTS || !plan.singleSpeakerVoice) {
                    return res.status(400).json({ success: false, error: "AI Plan Error: Missing text or voice for single_tts_direct.", plan });
                }
                const singleDirectRes = await app.handleSingleTTS({ 
                    sessionId, 
                    text: plan.fullTextForTTS, 
                    voice: plan.singleSpeakerVoice, 
                    style: plan.singleSpeakerStyle 
                });
                if (!singleDirectRes.success) throw new Error(singleDirectRes.error || "Single TTS Direct failed");
                finalResult = { ...finalResult, ...singleDirectRes };
                break;

            case 'single_tts_generate':
                // Generate script for single speaker
                if (!plan.scriptToGeneratePrompt) {
                    return res.status(400).json({ success: false, error: "AI Plan Error: Missing script prompt for single_tts_generate.", plan });
                }
                const singleScriptGenRes = await app.handleGenerateTranscript({ 
                    sessionId, 
                    prompt: plan.scriptToGeneratePrompt, 
                    speakers: [], // No specific speakers for single voice narration
                    style: plan.scriptStyle || 'narration' 
                });
                if (!singleScriptGenRes.success) throw new Error(singleScriptGenRes.error || "Single TTS script generation failed");
                const generatedSingleText = singleScriptGenRes.transcript;
                finalResult.generatedScript = generatedSingleText;
                finalResult.scriptFiles = singleScriptGenRes.files;

                const singleGenerateRes = await app.handleSingleTTS({ 
                    sessionId, 
                    text: generatedSingleText, 
                    voice: plan.singleSpeakerVoice, 
                    style: plan.singleSpeakerStyle 
                });
                if (!singleGenerateRes.success) throw new Error(singleGenerateRes.error || "Single TTS from generated script failed");
                finalResult = { ...finalResult, ...singleGenerateRes };
                break;

            case 'duo_tts_direct':
                // User provides ready text for exactly 2 speakers
                if (!plan.fullTextForTTS || !plan.duoSpeakerConfig || plan.duoSpeakerConfig.length !== 2) {
                    return res.status(400).json({ success: false, error: "AI Plan Error: Missing text or exactly 2 speakers required for duo_tts_direct.", plan });
                }
                const duoDirectRes = await app.handleMultiTTS({ 
                    sessionId, 
                    text: plan.fullTextForTTS, 
                    speakers: plan.duoSpeakerConfig 
                });
                if (!duoDirectRes.success) throw new Error(duoDirectRes.error || "Duo TTS Direct failed");
                finalResult = { ...finalResult, ...duoDirectRes };
                break;

            case 'duo_tts_generate':
                // Generate script for exactly 2 speakers
                if (!plan.scriptToGeneratePrompt || !plan.scriptSpeakers || plan.scriptSpeakers.length !== 2 || !plan.duoSpeakerConfig || plan.duoSpeakerConfig.length !== 2) {
                    return res.status(400).json({ success: false, error: "AI Plan Error: Missing script prompt or exactly 2 speakers required for duo_tts_generate.", plan });
                }
                const duoScriptGenRes = await app.handleGenerateTranscript({ 
                    sessionId, 
                    prompt: plan.scriptToGeneratePrompt, 
                    speakers: plan.scriptSpeakers, 
                    style: plan.scriptStyle || 'conversation' 
                });
                if (!duoScriptGenRes.success) throw new Error(duoScriptGenRes.error || "Duo script generation failed");
                const generatedDuoText = duoScriptGenRes.transcript;
                finalResult.generatedScript = generatedDuoText;
                finalResult.scriptFiles = duoScriptGenRes.files;

                const duoGenerateRes = await app.handleMultiTTS({ 
                    sessionId, 
                    text: generatedDuoText, 
                    speakers: plan.duoSpeakerConfig 
                });
                if (!duoGenerateRes.success) throw new Error(duoGenerateRes.error || "Duo TTS from generated script failed");
                finalResult = { ...finalResult, ...duoGenerateRes };
                break;

            case 'conversation_tts_direct':
                // User provides ready text for 3+ speakers
                if (!plan.fullTextForTTS || !plan.conversationSpeakers || plan.conversationSpeakers.length < 3) {
                    return res.status(400).json({ success: false, error: "AI Plan Error: Missing text or at least 3 speakers required for conversation_tts_direct.", plan });
                }
                const conversationDirectRes = await app.handleConversationTTS({ 
                    sessionId, 
                    text: plan.fullTextForTTS, 
                    speakers: plan.conversationSpeakers 
                });
                if (!conversationDirectRes.success) throw new Error(conversationDirectRes.error || "Conversation TTS Direct failed");
                finalResult = { ...finalResult, ...conversationDirectRes };
                break;

            case 'conversation_tts_generate':
                // Generate script for 3+ speakers
                if (!plan.scriptToGeneratePrompt || !plan.scriptSpeakers || plan.scriptSpeakers.length < 3 || !plan.conversationSpeakers || plan.conversationSpeakers.length < 3) {
                    return res.status(400).json({ success: false, error: "AI Plan Error: Missing script prompt or at least 3 speakers required for conversation_tts_generate.", plan });
                }
                const convScriptGenRes = await app.handleGenerateTranscript({ 
                    sessionId, 
                    prompt: plan.scriptToGeneratePrompt, 
                    speakers: plan.scriptSpeakers, 
                    style: plan.scriptStyle || 'conversation' 
                });
                if (!convScriptGenRes.success) throw new Error(convScriptGenRes.error || "Conversation script generation failed");
                const generatedConvText = convScriptGenRes.transcript;
                finalResult.generatedScript = generatedConvText;
                finalResult.scriptFiles = convScriptGenRes.files;

                const conversationGenerateRes = await app.handleConversationTTS({ 
                    sessionId, 
                    text: generatedConvText, 
                    speakers: plan.conversationSpeakers 
                });
                if (!conversationGenerateRes.success) throw new Error(conversationGenerateRes.error || "Conversation TTS from generated script failed");
                finalResult = { ...finalResult, ...conversationGenerateRes };
                break;

            default:
                return res.status(400).json({ success: false, error: `AI Plan Error: Unknown task_type '${plan.taskType}'. Expected one of: single_tts_direct, single_tts_generate, duo_tts_direct, duo_tts_generate, conversation_tts_direct, conversation_tts_generate`, plan });
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

// Internal handler for conversation TTS logic (3+ speakers)
app.handleConversationTTS = async (params) => {
    const { sessionId, text, speakers } = params;
    if (!genAI) throw new Error("AI Service not initialized. Check GEMINI_API_KEY.");
    
    // Use AI orchestrator to segment the conversation into 2-speaker groups
    const orchestratorModel = genAI.getGenerativeModel({ model: ORCHESTRATOR_MODEL });
    const validVoices = VOICES.join(', ');
    const segmentationPrompt = `
You are an AI assistant that segments multi-speaker conversations for text-to-speech generation.

TASK: Analyze the provided conversation text and segment it into groups where each group contains exactly 2 speakers. The goal is to create natural conversation segments that can be processed by a 2-speaker TTS system and produce high-quality audio.

CRITICAL CONSTRAINTS:
1. Each segment must have exactly 2 speakers
2. You MUST use only the exact speaker names and voices provided in the INPUT SPEAKERS list below
3. DO NOT create new speaker names or voice names - only use the ones provided
4. Each speaker object must use the exact name and voice combination from the input

RULES:
1. Create natural, flowing dialogue segments - allow speakers to have multiple lines if it improves flow
2. When a third speaker appears, start a new segment with appropriate context
3. Maintain conversational context and natural pacing
4. Use multiline format for natural speech patterns
5. Preserve the original speaker names and content meaning
6. Add natural transitions and context when needed for TTS clarity

INPUT TEXT: "${text}"

INPUT SPEAKERS (USE THESE EXACT NAME/VOICE COMBINATIONS ONLY):
${speakers.map(s => `- ${s.name} (voice: ${s.voice})`).join('\n')}

VALID VOICES (for reference): ${validVoices}

OUTPUT: Return a JSON array of conversation segments using multiline format for natural TTS:
[
  {
    "segmentIndex": 1,
    "speakers": [{"name": "SpeakerA", "voice": "VoiceA"}, {"name": "SpeakerB", "voice": "VoiceB"}],
    "text": "SpeakerA: Hello there! I'm glad we could meet today.\\nSpeakerB: Hi, how are you? It's great to see you too.\\nSpeakerA: Let's get started with our discussion.",
    "description": "Brief description of this segment"
  },
  ...
]

IMPORTANT: 
- Use \\n for line breaks in the text field to create natural multiline dialogue that will sound better when converted to speech
- Each speaker can have multiple consecutive lines if it creates better flow
- ONLY use the exact speaker names and voices from the INPUT SPEAKERS list above
- DO NOT invent new names like "ModeratorVoice" or other variations

Respond ONLY with the JSON array.`;

    // Save the segmentation prompt for debugging
    const promptTimestamp = Date.now();
    const segmentationPromptFileName = `conversation_segmentation_prompt_${promptTimestamp}.json`;
    const promptData = {
        originalText: text,
        speakers: speakers,
        segmentationPrompt: segmentationPrompt,
        timestamp: new Date()
    };
    await saveSessionData(sessionId, 'prompts', segmentationPromptFileName, promptData);
    sessions.get(sessionId).files.prompts.push(segmentationPromptFileName);

    const segmentationResult = await orchestratorModel.generateContent(segmentationPrompt);
    const segmentationJsonString = segmentationResult.response.text().replace(/^```json\s*|```$/g, "").trim();
    
    let segments;
    try {
        segments = JSON.parse(segmentationJsonString);
    } catch (e) {
        console.error("Error parsing conversation segmentation JSON:", segmentationJsonString, e);
        throw new Error('Failed to parse conversation segmentation from AI orchestrator.');
    }

    if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error('AI orchestrator did not return valid conversation segments.');
    }

    // Validate that all segments use only valid voices and speakers
    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (!segment.speakers || segment.speakers.length !== 2) {
            throw new Error(`Segment ${i + 1} does not have exactly 2 speakers`);
        }
        
        // Validate that each speaker uses a valid voice from the VOICES array
        for (const speaker of segment.speakers) {
            if (!VOICES.includes(speaker.voice)) {
                console.error(`Invalid voice detected in segment ${i + 1}:`, speaker.voice);
                console.error(`Valid voices are:`, VOICES);
                console.error(`Segment speakers:`, segment.speakers);
                throw new Error(`Segment ${i + 1} uses invalid voice '${speaker.voice}'. Valid voices are: ${VOICES.join(', ')}`);
            }
            
            // Validate that the speaker name exists in the original speakers list
            const originalSpeaker = speakers.find(s => s.name === speaker.name);
            if (!originalSpeaker) {
                console.error(`Invalid speaker name detected in segment ${i + 1}:`, speaker.name);
                console.error(`Original speakers:`, speakers.map(s => s.name));
                throw new Error(`Segment ${i + 1} uses invalid speaker name '${speaker.name}'. Original speakers are: ${speakers.map(s => s.name).join(', ')}`);
            }
            
            // Validate that the speaker is using the correct voice
            if (originalSpeaker.voice !== speaker.voice) {
                console.error(`Voice mismatch in segment ${i + 1} for speaker ${speaker.name}:`, {
                    expected: originalSpeaker.voice,
                    actual: speaker.voice
                });
                throw new Error(`Segment ${i + 1} speaker '${speaker.name}' should use voice '${originalSpeaker.voice}', not '${speaker.voice}'`);
            }
        }
    }

    // Create initial conversation metadata RIGHT AFTER segmentation, BEFORE audio generation
    const timestamp = Date.now();
    const combinedFileName = `conversation_${speakers.map(s=>s.name.replace(/[^a-z0-9]/gi, '_')).join('_')}_${timestamp}.wav`;
    
    // Create placeholder segments for metadata (will be updated with audio info later)
    const placeholderSegments = segments.map((segment, i) => ({
        segmentIndex: segment.segmentIndex || (i + 1),
        description: segment.description,
        speakers: segment.speakers,
        text: segment.text,
        audioFile: null,  // Will be filled after audio generation
        audioUrl: null,   // Will be filled after audio generation
        status: 'pending' // Will be updated as each segment is processed
    }));

    const initialConversationData = {
        originalText: text,
        speakers: speakers,
        segments: placeholderSegments,
        segmentationPrompt: segmentationPrompt,
        rawSegmentation: segmentationJsonString,
        timestamp: new Date(),
        combinedAudioFile: combinedFileName,
        status: 'segmentation_complete',
        audioGenerationStatus: 'pending',
        totalSegments: segments.length
    };

    // Save initial conversation metadata before any audio generation
    const conversationMetaFile = `conversation_meta_${timestamp}.json`;
    await saveSessionData(sessionId, 'transcripts', conversationMetaFile, initialConversationData);
    sessions.get(sessionId).files.transcripts.push(conversationMetaFile);
    console.log(`Conversation metadata saved after segmentation, before audio generation: ${conversationMetaFile}`);
    console.log(`Generated ${segments.length} segments. Starting audio generation...`);

    // Generate audio for each segment
    const audioSegments = [];
    const allAudioFiles = [];

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        // Generate audio for this segment using duo TTS
        const segmentResult = await app.handleMultiTTS({
            sessionId,
            text: segment.text,
            speakers: segment.speakers
        });

        if (!segmentResult.success) {
            throw new Error(`Failed to generate audio for segment ${i + 1}: ${segmentResult.error}`);
        }

        audioSegments.push({
            segmentIndex: segment.segmentIndex || (i + 1),
            description: segment.description,
            speakers: segment.speakers,
            audioFile: segmentResult.audioFile,
            audioUrl: segmentResult.audioUrl
        });
        allAudioFiles.push(segmentResult.audioFile);
    }

    // Combine all segments into a single audio file
    const sessionDir = sessions.get(sessionId).directory;
    const combinedFilePath = path.join(sessionDir, 'audio', combinedFileName);

    // Update conversation metadata with actual segment data (now that audio generation is complete)
    const updatedConversationData = {
        ...initialConversationData,
        segments: audioSegments,
        status: 'segments_generated',
        audioGenerationStatus: 'completed',
        combinationStatus: 'pending'
    };

    // Update conversation metadata with completed segments
    await saveSessionData(sessionId, 'transcripts', conversationMetaFile, updatedConversationData);
    console.log(`Conversation metadata updated with generated audio segments: ${conversationMetaFile}`);

    // Actually concatenate the audio files using ffmpeg
    let combinationSuccess = false;
    if (audioSegments.length > 1) {
        console.log(`Combining ${audioSegments.length} audio segments...`);
        try {
            await new Promise((resolve, reject) => {
                const ffmpegCommand = ffmpeg();
                
                // Add all segment audio files as inputs
                audioSegments.forEach(segment => {
                    const segmentPath = path.join(sessionDir, 'audio', segment.audioFile);
                    ffmpegCommand.input(segmentPath);
                });
                
                // Concatenate and output
                ffmpegCommand
                    .on('end', () => {
                        console.log('Audio concatenation completed successfully');
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error('Error during audio concatenation:', err);
                        reject(err);
                    })
                    .mergeToFile(combinedFilePath, path.join(sessionDir, 'temp'));
            });
            
            // Add the combined file to session files
            sessions.get(sessionId).files.audio.push(combinedFileName);
            combinationSuccess = true;
            
        } catch (error) {
            console.error('Failed to concatenate audio segments:', error);
            // Fall back to using the first segment if concatenation fails
            console.log('Falling back to first segment as main audio');
            combinationSuccess = false;
        }
    } else if (audioSegments.length === 1) {
        // If only one segment, copy it as the combined file
        const singleSegmentPath = path.join(sessionDir, 'audio', audioSegments[0].audioFile);
        await fs.copyFile(singleSegmentPath, combinedFilePath);
        sessions.get(sessionId).files.audio.push(combinedFileName);
        combinationSuccess = true;
    }

    // Update conversation metadata with final status
    const finalConversationData = {
        ...updatedConversationData,
        status: 'completed',
        combinationStatus: combinationSuccess ? 'success' : 'failed',
        combinationCompletedAt: new Date()
    };

    // Update the metadata file with final status
    await saveSessionData(sessionId, 'transcripts', conversationMetaFile, finalConversationData);
    console.log(`Conversation metadata updated with final status: combination ${combinationSuccess ? 'successful' : 'failed'}`);

    // Return the combined audio file as the main audio
    const mainAudioUrl = `/api/audio/${sessionId}/${combinedFileName}`;

    return {
        success: true,
        conversationType: 'segmented',
        totalSegments: segments.length,
        segments: audioSegments,
        allAudioFiles: allAudioFiles,
        conversationMetaFile: conversationMetaFile,
        audioFile: combinedFileName,
        audioUrl: mainAudioUrl,
        mainAudioUrl: mainAudioUrl,
        message: `Conversation processed into ${segments.length} segments and combined into a single audio file.`
    };
};