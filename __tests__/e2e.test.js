const request = require('supertest');
const app = require('../server');

describe('End-to-End Workflow Test', () => {
  it('should complete the full workflow: create session -> generate transcript -> generate duo speaker audio', async () => {
    // 1. Create session
    const sessionResponse = await request(app).post('/api/session').send();
    expect(sessionResponse.statusCode).toBe(200);
    const sessionId = sessionResponse.body.sessionId;
    expect(sessionId).toBeDefined();

    // 2. Generate transcript
    const transcriptPayload = {
      sessionId,
      prompt: 'Create a short excited conversation about discovering a new planet', //
      speakers: ['Dr. Nova', 'Commander Rex'], //
      style: 'excited science podcast' //
    };
    const transcriptResponse = await request(app)
      .post('/api/generate-transcript')
      .send(transcriptPayload);
    expect(transcriptResponse.statusCode).toBe(200);
    const transcript = transcriptResponse.body.transcript;
    expect(transcript).toBeDefined();

    // 3. Generate duo speaker audio from the transcript
    const audioPayload = {
      sessionId,
      text: transcript, // Use the generated transcript
      speakers: [ //
        { name: 'Dr. Nova', voice: 'Kore' },
        { name: 'Commander Rex', voice: 'Puck' }
      ]
    };
    const audioResponse = await request(app)
      .post('/api/tts/duo')
      .send(audioPayload);
    expect(audioResponse.statusCode).toBe(200);
    expect(audioResponse.body.success).toBe(true);
    expect(audioResponse.body.audioUrl).toBeDefined();
    console.log('E2E Test Audio available at:', audioResponse.body.audioUrl); //
  }, 240000); // Long timeout for multiple API calls

  it('should complete conversation workflow: create session -> generate conversation TTS with 3+ speakers', async () => {
    // 1. Create session
    const sessionResponse = await request(app).post('/api/session').send();
    expect(sessionResponse.statusCode).toBe(200);
    const sessionId = sessionResponse.body.sessionId;
    expect(sessionId).toBeDefined();

    // 2. Generate conversation TTS with 3 speakers
    const conversationPayload = {
      sessionId,
      text: 'Alice: Welcome to our team meeting! Bob: Thanks Alice, excited to share updates. Carol: Great to be here, I have some backend progress to discuss. Alice: Perfect, let\'s start with Bob.',
      speakers: [
        { name: 'Alice', voice: 'Zephyr' },
        { name: 'Bob', voice: 'Kore' },
        { name: 'Carol', voice: 'Aoede' }
      ]
    };
    const conversationResponse = await request(app)
      .post('/api/tts/conversation')
      .send(conversationPayload);
    expect(conversationResponse.statusCode).toBe(200);
    expect(conversationResponse.body.success).toBe(true);
    expect(conversationResponse.body.audioUrl).toBeDefined();
    expect(conversationResponse.body.segments).toBeDefined();
    expect(Array.isArray(conversationResponse.body.segments)).toBe(true);
    console.log('E2E Conversation Test Audio available at:', conversationResponse.body.audioUrl);
  }, 360000); // Even longer timeout for AI orchestration and conversation processing
});