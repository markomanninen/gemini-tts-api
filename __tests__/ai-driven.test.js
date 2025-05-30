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
    // expect(response.body.aiPlan.taskType).toEqual('generate_script_then_tts');
  }, 60000);
});