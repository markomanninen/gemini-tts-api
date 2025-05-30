const request = require('supertest');
const app = require('../server');

describe('End-to-End Workflow Test', () => {
  it('should complete the full workflow: create session -> generate transcript -> generate multi-speaker audio', async () => {
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

    // 3. Generate multi-speaker audio from the transcript
    const audioPayload = {
      sessionId,
      text: transcript, // Use the generated transcript
      speakers: [ //
        { name: 'Dr. Nova', voice: 'Kore' },
        { name: 'Commander Rex', voice: 'Puck' }
      ]
    };
    const audioResponse = await request(app)
      .post('/api/tts/multi')
      .send(audioPayload);
    expect(audioResponse.statusCode).toBe(200);
    expect(audioResponse.body.success).toBe(true);
    expect(audioResponse.body.audioUrl).toBeDefined();
    console.log('E2E Test Audio available at:', audioResponse.body.audioUrl); //
  }, 240000); // Long timeout for multiple API calls
});