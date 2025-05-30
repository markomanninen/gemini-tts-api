const request = require('supertest');
const app = require('../server');

describe('Transcript Generation API', () => {
  let sessionId;

  beforeAll(async () => {
    // Create a session for these tests
    const res = await request(app).post('/api/session').send();
    sessionId = res.body.sessionId;
  });

  it('POST /api/generate-transcript - should generate a transcript', async () => {
    const response = await request(app)
      .post('/api/generate-transcript')
      .send({
        sessionId: sessionId,
        prompt: "Generate a short conversation about weather.",
        speakers: ["Alice", "Bob"],
        style: "podcast" //
      });
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.transcript).toBeDefined();
    expect(typeof response.body.transcript).toBe('string');
    expect(response.body.files.prompt).toBeDefined(); //
    expect(response.body.files.transcript).toBeDefined(); //
  }, 30000); // Increase timeout for AI API calls

  it('POST /api/generate-transcript - should require a prompt', async () => {
    const response = await request(app)
      .post('/api/generate-transcript')
      .send({
        sessionId: sessionId,
        speakers: ["Alice", "Bob"],
        style: "podcast"
      });
    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toEqual('Prompt is required'); //
  });
});