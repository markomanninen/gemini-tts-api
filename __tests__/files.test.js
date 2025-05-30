const request = require('supertest');
const app = require('../server');
const fs = require('fs').promises;
const path = require('path');

describe('File Management API', () => {
  let sessionId;
  let generatedAudioFile;

  beforeAll(async () => {
    // 1. Create session
    /*
    const sessionRes = await request(app).post('/api/session').send();
    sessionId = sessionRes.body.sessionId;

    // 2. Generate a dummy audio file to test retrieval
    const ttsRes = await request(app)
      .post('/api/tts/single')
      .send({
        sessionId: sessionId,
        text: "File test audio.",
        voice: "Zephyr"
      });
    if (ttsRes.body.success) {
      generatedAudioFile = ttsRes.body.audioFile;
    }
    */
    sessionId = 'd79933b3-cb5e-4c28-a4ec-f77425e2c7c0'; // Mock session ID for testing
  });

  it('GET /api/session/:sessionId/files - should list files in a session', async () => {
    expect(sessionId).toBeDefined();
    // May need a slight delay for file system operations if tests run too fast
    await new Promise(resolve => setTimeout(resolve, 500));

    const response = await request(app)
      .get(`/api/session/${sessionId}/files`);
    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.files.audio).toBeInstanceOf(Array); //
    if (generatedAudioFile) {
      expect(response.body.files.audio.some(f => f.name === generatedAudioFile)).toBe(true);
    }
  });

  it('GET /api/audio/:sessionId/:filename - should retrieve an audio file', async () => {
    expect(sessionId).toBeDefined();
    expect(generatedAudioFile).toBeDefined();

    const response = await request(app)
      .get(`/api/audio/${sessionId}/${generatedAudioFile}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toEqual('audio/wav'); //
  });

  // Add tests for prompt/transcript file retrieval similarly
  // GET /api/file/:sessionId/:type/:filename
});