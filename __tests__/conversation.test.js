const request = require('supertest');
const app = require('../server');

describe('Conversation TTS API', () => {
  let sessionId;

  beforeAll(async () => {
    const res = await request(app).post('/api/session').send();
    sessionId = res.body.sessionId;
  });

  describe('Multi-Speaker Conversation TTS (3+ speakers)', () => {
    it('POST /api/tts/conversation - should generate conversation audio with 3 speakers', async () => {
      const response = await request(app)
        .post('/api/tts/conversation')
        .send({
          sessionId: sessionId,
          text: "Alice: Welcome to our meeting! Bob: Thanks Alice, great to be here. Carol: Excited to discuss the project updates.",
          speakers: [
            { name: "Alice", voice: "Zephyr" },
            { name: "Bob", voice: "Puck" },
            { name: "Carol", voice: "Aoede" }
          ]
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.conversationMetaFile).toMatch(/\.json$/);
      expect(response.body.audioFile).toMatch(/\.wav$/);
      expect(response.body.audioUrl).toBeDefined();
      expect(response.body.mainAudioUrl).toBeDefined();
      expect(response.body.segments).toBeDefined();
      expect(Array.isArray(response.body.segments)).toBe(true);
      expect(response.body.conversationType).toBe('segmented');
      expect(response.body.totalSegments).toBeGreaterThan(0);
    }, 60000); // Higher timeout for AI orchestration and multiple segments

    it('POST /api/tts/conversation - should generate conversation audio with 4 speakers', async () => {
      const response = await request(app)
        .post('/api/tts/conversation')
        .send({
          sessionId: sessionId,
          text: "Alice: Let's start the team standup. Bob: I'll go first with frontend updates. Carol: I have backend progress to share. Dave: And I'll cover testing updates.",
          speakers: [
            { name: "Alice", voice: "Zephyr" },
            { name: "Bob", voice: "Puck" },
            { name: "Carol", voice: "Aoede" },
            { name: "Dave", voice: "Charon" }
          ]
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.conversationMetaFile).toMatch(/\.json$/);
      expect(response.body.mainAudioUrl).toBeDefined();
      expect(response.body.segments).toBeDefined();
      expect(Array.isArray(response.body.segments)).toBe(true);
      expect(response.body.conversationType).toBe('segmented');
      expect(response.body.totalSegments).toBeGreaterThan(0);
    }, 60000);

    it('POST /api/tts/conversation - should return error for less than 3 speakers', async () => {
      const response = await request(app)
        .post('/api/tts/conversation')
        .send({
          sessionId: sessionId,
          text: "Alice: Hello! Bob: Hi there!",
          speakers: [
            { name: "Alice", voice: "Zephyr" },
            { name: "Bob", voice: "Kore" }
          ]
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toContain('Text and speakers array with at least 3 speakers are required');
    });

    it('POST /api/tts/conversation - should return error for missing text', async () => {
      const response = await request(app)
        .post('/api/tts/conversation')
        .send({
          sessionId: sessionId,
          speakers: [
            { name: "Alice", voice: "Zephyr" },
            { name: "Bob", voice: "Kore" },
            { name: "Carol", voice: "Aoede" }
          ]
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toContain('Text and speakers array with at least 3 speakers are required');
    });

    it('POST /api/tts/conversation - should return error for invalid voice', async () => {
      const response = await request(app)
        .post('/api/tts/conversation')
        .send({
          sessionId: sessionId,
          text: "Alice: Hello! Bob: Hi! Carol: Hey!",
          speakers: [
            { name: "Alice", voice: "InvalidVoice" },
            { name: "Bob", voice: "Kore" },
            { name: "Carol", voice: "Aoede" }
          ]
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toContain('Invalid voice');
    });

    it('POST /api/tts/conversation - should return error for missing session', async () => {
      const response = await request(app)
        .post('/api/tts/conversation')
        .send({
          text: "Alice: Hello! Bob: Hi! Carol: Hey!",
          speakers: [
            { name: "Alice", voice: "Zephyr" },
            { name: "Bob", voice: "Kore" },
            { name: "Carol", voice: "Aoede" }
          ]
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toContain('Valid session ID required');
    });

    it('POST /api/tts/conversation - should return error for duplicate speaker names', async () => {
      const response = await request(app)
        .post('/api/tts/conversation')
        .send({
          sessionId: sessionId,
          text: "Alice: Hello! Alice: Hi again! Bob: Hey!",
          speakers: [
            { name: "Alice", voice: "Zephyr" },
            { name: "Alice", voice: "Kore" },
            { name: "Bob", voice: "Aoede" }
          ]
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body.error).toContain('duplicate speaker names');
    });
  });
});
