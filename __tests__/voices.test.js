const request = require('supertest');
const app = require('../server');

describe('Voices API', () => {
  it('GET /api/voices - should return the list of available voices', async () => {
    const response = await request(app).get('/api/voices');
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.voices).toBeInstanceOf(Array);
    expect(response.body.voices.length).toBeGreaterThan(0); //
    expect(response.body.voices).toContain('Kore'); // Check for a known voice
  });
});