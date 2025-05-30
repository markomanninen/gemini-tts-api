const request = require('supertest');
const app = require('../server');

describe('TTS API', () => {
  let sessionId;

  beforeAll(async () => {
    const res = await request(app).post('/api/session').send();
    sessionId = res.body.sessionId;
  });

  // Single Speaker TTS
  describe('Single Speaker TTS', () => {
    it('POST /api/tts/single - should generate single speaker audio', async () => {
      const response = await request(app)
        .post('/api/tts/single')
        .send({
          sessionId: sessionId,
          text: "Hello, this is a test.",
          voice: "Kore" //
        });
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.audioFile).toMatch(/\.wav$/); //
      expect(response.body.audioUrl).toBeDefined(); //
    }, 20000);

    it('POST /api/tts/single - should return error for invalid voice', async () => {
      const response = await request(app)
        .post('/api/tts/single')
        .send({
          sessionId: sessionId,
          text: "Hello world",
          voice: "InvalidVoice"
        });
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toContain('Invalid voice'); //
    });
  });

  // Duo Speaker TTS (exactly 2 speakers)
  describe('Duo Speaker TTS', () => {
    it('POST /api/tts/duo - should generate duo speaker audio', async () => {
      const response = await request(app)
        .post('/api/tts/duo')
        .send({
          sessionId: sessionId,
          text: "SpeakerA: Hello! SpeakerB: Hi there.",
          speakers: [ //
            { name: "SpeakerA", voice: "Kore" },
            { name: "SpeakerB", voice: "Puck" }
          ]
        });
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.audioFile).toMatch(/\.wav$/); //
      expect(response.body.audioUrl).toBeDefined(); //
    }, 30000); // Higher timeout for potentially complex TTS

    it('POST /api/tts/duo - should return error for more than 2 speakers', async () => {
      const response = await request(app)
        .post('/api/tts/duo')
        .send({
          sessionId: sessionId,
          text: "A: Hi B: Hello C: Hey",
          speakers: [
            { name: "A", voice: "Kore" },
            { name: "B", voice: "Puck" },
            { name: "C", voice: "Zephyr" }
          ]
        });
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toEqual('Maximum 2 speakers supported'); //
    });
  });
});