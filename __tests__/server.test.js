const request = require('supertest');
const app = require('../server'); // Assuming your main app file is gemini-tts-api.js

describe('Server Health', () => {
  it('should return 200 OK from /health', async () => {
    const response = await request(app).get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toEqual('Gemini TTS API is running'); //
  });
});

describe('Environment Configuration', () => {
    it('should have GEMINI_API_KEY loaded in process.env (requires .env file)', () => {
        // This test relies on Jest setup loading dotenv or running the app which loads dotenv.
        // For a pure unit test, you might mock process.env.
        expect(process.env.GEMINI_API_KEY).toBeDefined();
        // Avoid checking the actual key value in tests.
        expect(process.env.GEMINI_API_KEY).not.toBe('your_gemini_api_key_here'); // Check if it's changed from default
    });
});