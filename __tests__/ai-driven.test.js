const request = require('supertest');
const app = require('../server'); // Assuming the new endpoint is added to this app

describe('AI-Driven Generation API', () => {
  let sessionId;

  beforeAll(async () => {
    const res = await request(app).post('/api/session').send();
    sessionId = res.body.sessionId;
  });

  it('POST /api/ai-driven-generation - should handle a simple single TTS prompt', async () => {
    const response = await request(app)
      .post('/api/ai-driven-generation') // Or your chosen name like /api/generate-complex
      .send({
        sessionId: sessionId,
        userPrompt: "Say 'Hello, AI world!' in a clear voice like Leda."
      });
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.audioUrl).toBeDefined();
    // Optionally check aspects of the plan if returned
    // expect(response.body.aiPlan.taskType).toEqual('single_tts');
    // expect(response.body.aiPlan.singleSpeakerVoice).toEqual('Leda');
  }, 60000); // Generous timeout for multiple AI steps

  it('POST /api/ai-driven-generation - should handle a prompt requiring script generation and multi-speaker TTS', async () => {
    const response = await request(app)
      .post('/api/ai-driven-generation')
      .send({
        sessionId: sessionId,
        userPrompt: "Create a short dialogue for a podcast intro between two hosts, 'HostA' (voice Puck) and 'HostB' (voice Zephyr), welcoming listeners."
      });
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.audioUrl).toBeDefined();
    expect(response.body.generatedScript).toBeDefined();
    expect(response.body.aiPlan.taskType).toEqual('generate_script_then_tts');
  }, 60000);

  it('POST /api/ai-driven-generation - should handle multi_tts_direct with existing 2-speaker dialogue', async () => {
    const response = await request(app)
      .post('/api/ai-driven-generation')
      .send({
        sessionId: sessionId,
        userPrompt: "Alex: Hey Ben, how was your weekend? Ben: Pretty good, went hiking. You?"
      });
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.audioUrl).toBeDefined();
    expect(response.body.aiPlan.taskType).toEqual('multi_tts_direct');
    expect(response.body.aiPlan.multiSpeakerConfig).toBeDefined();
    expect(response.body.aiPlan.multiSpeakerConfig.length).toEqual(2);
    expect(response.body.aiPlan.fullTextForTTS).toContain('Alex:');
    expect(response.body.aiPlan.fullTextForTTS).toContain('Ben:');
  }, 60000);

  it('POST /api/ai-driven-generation - should handle conversation_tts for 3+ speakers with script generation', async () => {
    const response = await request(app)
      .post('/api/ai-driven-generation')
      .send({
        sessionId: sessionId,
        userPrompt: "Create a team meeting discussion with project manager Alice, developer Bob, and designer Carol discussing project updates."
      });
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.mainAudioUrl).toBeDefined();
    expect(response.body.segments).toBeDefined();
    expect(Array.isArray(response.body.segments)).toBe(true);
    expect(response.body.generatedScript).toBeDefined();
    expect(response.body.aiPlan.taskType).toEqual('conversation_tts');
    expect(response.body.aiPlan.conversationSpeakers).toBeDefined();
    expect(response.body.aiPlan.conversationSpeakers.length).toBeGreaterThanOrEqual(3);
    expect(response.body.conversationType).toBe('segmented');
  }, 60000);

  it('POST /api/ai-driven-generation - should handle conversation_tts direct with existing 3+ speaker dialogue', async () => {
    const response = await request(app)
      .post('/api/ai-driven-generation')
      .send({
        sessionId: sessionId,
        userPrompt: "Alice: Welcome to our meeting! Bob: Thanks Alice, excited to share updates. Carol: Great to be here, I have progress to discuss. Alice: Perfect, let's start!"
      });
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.mainAudioUrl).toBeDefined();
    expect(response.body.segments).toBeDefined();
    expect(Array.isArray(response.body.segments)).toBe(true);
    expect(response.body.aiPlan.taskType).toEqual('conversation_tts');
    expect(response.body.aiPlan.conversationSpeakers).toBeDefined();
    expect(response.body.aiPlan.conversationSpeakers.length).toBeGreaterThanOrEqual(3);
    expect(response.body.conversationType).toBe('segmented');
    expect(response.body.aiPlan.fullTextForTTS).toContain('Alice:');
    expect(response.body.aiPlan.fullTextForTTS).toContain('Bob:');
    expect(response.body.aiPlan.fullTextForTTS).toContain('Carol:');
  }, 60000);

  it('POST /api/ai-driven-generation - should handle duo speaker generation request', async () => {
    const response = await request(app)
      .post('/api/ai-driven-generation')
      .send({
        sessionId: sessionId,
        userPrompt: "Create a brief conversation between teacher Professor Smith and student Amy about homework assignment."
      });
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.audioUrl).toBeDefined();
    expect(response.body.generatedScript).toBeDefined();
    expect(response.body.aiPlan.taskType).toEqual('generate_script_then_tts');
    expect(response.body.aiPlan.scriptSpeakers).toBeDefined();
    expect(response.body.aiPlan.scriptSpeakers.length).toEqual(2);
    expect(response.body.aiPlan.multiSpeakerConfig).toBeDefined();
    expect(response.body.aiPlan.multiSpeakerConfig.length).toEqual(2);
  }, 60000);

  it('POST /api/ai-driven-generation - should distinguish between 2-speaker and 3+ speaker scenarios', async () => {
    // Test 2-speaker scenario (should use multi_tts_direct or generate_script_then_tts)
    const twoSpeakerResponse = await request(app)
      .post('/api/ai-driven-generation')
      .send({
        sessionId: sessionId,
        userPrompt: "John: How's the weather today? Jane: It's sunny and warm!"
      });
    
    expect(twoSpeakerResponse.statusCode).toBe(200);
    expect(twoSpeakerResponse.body.success).toBe(true);
    expect(twoSpeakerResponse.body.aiPlan.taskType).toEqual('multi_tts_direct');
    expect(twoSpeakerResponse.body.audioUrl).toBeDefined(); // Regular audioUrl for 2-speaker

    // Test 3+ speaker scenario (should use conversation_tts)
    const threeSpeakerResponse = await request(app)
      .post('/api/ai-driven-generation')
      .send({
        sessionId: sessionId,
        userPrompt: "Mark: Good morning team! Lisa: Morning Mark! Tom: Hey everyone, ready for the meeting?"
      });
    
    expect(threeSpeakerResponse.statusCode).toBe(200);
    expect(threeSpeakerResponse.body.success).toBe(true);
    expect(threeSpeakerResponse.body.aiPlan.taskType).toEqual('conversation_tts');
    expect(threeSpeakerResponse.body.mainAudioUrl).toBeDefined(); // mainAudioUrl for 3+ speaker
    expect(threeSpeakerResponse.body.segments).toBeDefined();
    expect(threeSpeakerResponse.body.conversationType).toBe('segmented');
  }, 60000);

  it('POST /api/ai-driven-generation - should recognize single voice narration vs multi-speaker dialogue', async () => {
    // Test single voice podcast/narration request (should use single_tts even if dialogue is mentioned)
    const singleVoiceResponse = await request(app)
      .post('/api/ai-driven-generation')
      .send({
        sessionId: sessionId,
        userPrompt: "Create a short podcast segment about AI ethics, narrated by a wise voice like Orus, discussing the dialogue between researchers and ethicists."
      });
    
    expect(singleVoiceResponse.statusCode).toBe(200);
    expect(singleVoiceResponse.body.success).toBe(true);
    expect(singleVoiceResponse.body.aiPlan.taskType).toEqual('single_tts');
    expect(singleVoiceResponse.body.aiPlan.singleSpeakerVoice).toBeDefined();
    expect(singleVoiceResponse.body.audioUrl).toBeDefined(); // Regular audioUrl for single speaker

    // Test actual multi-speaker dialogue request (should use generate_script_then_tts for 2 speakers)
    const multiSpeakerResponse = await request(app)
      .post('/api/ai-driven-generation')
      .send({
        sessionId: sessionId,
        userPrompt: "Create a conversation where researcher Dr. Smith and ethicist Prof. Jones debate AI safety protocols."
      });
    
    expect(multiSpeakerResponse.statusCode).toBe(200);
    expect(multiSpeakerResponse.body.success).toBe(true);
    expect(multiSpeakerResponse.body.aiPlan.taskType).toEqual('generate_script_then_tts');
    expect(multiSpeakerResponse.body.aiPlan.multiSpeakerConfig).toBeDefined();
    expect(multiSpeakerResponse.body.aiPlan.multiSpeakerConfig.length).toEqual(2);
    expect(multiSpeakerResponse.body.generatedScript).toBeDefined();
    expect(multiSpeakerResponse.body.audioUrl).toBeDefined(); // Regular audioUrl for 2-speaker
  }, 60000);
});