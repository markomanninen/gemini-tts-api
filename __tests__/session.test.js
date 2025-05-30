const request = require('supertest');
const app = require('../server');

describe('Session Management API', () => {
  let sessionId;

  it('POST /api/session - should create a new session', async () => {
    const response = await request(app)
      .post('/api/session')
      .send();
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.sessionId).toBeDefined();
    expect(response.body.message).toEqual('Session created successfully'); //
    sessionId = response.body.sessionId;
  });

  it('GET /api/session/:sessionId - should retrieve session information', async () => {
    expect(sessionId).toBeDefined(); // Ensure sessionId was captured
    const response = await request(app)
      .get(`/api/session/${sessionId}`);
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.session.id).toEqual(sessionId);
    expect(response.body.session.files).toBeDefined(); //
  });

  it('GET /api/session/:sessionId - should return 404 for non-existent session', async () => {
    const response = await request(app)
      .get('/api/session/non-existent-uuid');
    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toEqual('Session not found'); //
  });
});