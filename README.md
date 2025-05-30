# Gemini TTS API

A comprehensive Node.js API for text-to-speech generation using Google's Gemini AI with session-based file management for prompts, transcriptions, and audio files. This API also features an AI-driven endpoint that interprets natural language prompts to orchestrate TTS tasks.

## Features

- **Enhanced Session Management**: Each request session stores all generated files in organized directories with comprehensive session loading, saving, and removal capabilities. Sessions automatically load their file contents when selected, providing seamless access to all generated materials.
- **AI-Driven Generation**: A single endpoint (`/api/ai-driven-generation`) where AI interprets your prompt to orchestrate TTS tasks, including script generation, voice selection, and style.
- **Single & Multi-Speaker TTS**: Support for both single and multi-speaker audio generation (up to 2 speakers for multi-speaker).
- **Transcript Generation**: AI-powered prompt and transcript generation.
- **30 Voice Options**: A wide selection of Gemini TTS voices available.
- **File Organization**: Automatic saving of prompts, AI plans, transcripts, and audio files within session-specific directories.
- **RESTful API**: Easy-to-use and well-documented REST endpoints.
- **Audio Serving**: Direct audio file serving for generated `.wav` files.
- **Interactive Test Client**: Advanced HTML test client (`public/test-client.html`) with comprehensive session management, integrated file browsing, and automatic file refresh after each generation operation.
- **Real-time File Synchronization**: All generation operations automatically refresh session files, ensuring the latest content is always displayed without manual intervention.
- **Comprehensive Testing**: Setup with Jest for unit and integration tests.

## Requirements

- Node.js (version 18.0.0 or higher is recommended)
- npm (Node Package Manager)
- A valid Gemini API key
- Sufficient disk space for storing generated audio files and session data.

## Project Structure

```
gemini-tts-api/
├── __tests__/                  # Jest test files
│   ├── ai-driven.test.js
│   ├── e2e.test.js
│   ├── files.test.js
│   ├── server.test.js
│   ├── session.test.js
│   ├── transcript.test.js
│   └── tts.test.js
├── public/                     # Static files (e.g., test client)
│   └── test-client.html
├── sessions/                   # Dynamically created for storing session data (audio, transcripts, prompts)
├── .env                        # Environment variables (GEMINI_API_KEY, PORT) - (Create from .env.example)
├── .env.example                # Example environment file
├── .gitignore                  # Specifies intentionally untracked files that Git should ignore
├── init-project.sh             # Project setup and initialization script
├── package.json                # Project metadata and dependencies
├── package-lock.json           # Records exact versions of dependencies
├── readme-tts-api.md           # This README file (or README.md)
└── server.js                   # Main application file (or gemini-tts-api.js)
```

## Installation & Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/markomanninen/gemini-tts-api.git
    cd gemini-tts-api
    ```

2.  **Run the Initialization Script**:
    This script will check prerequisites, install dependencies, and help set up your `.env` file.
    ```bash
    chmod +x init-project.sh
    ./init-project.sh
    ```
    The script will guide you. If you prefer manual setup:

    * **Install Dependencies**:
        ```bash
        npm install
        ```
    * **Environment Setup**:
        Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
        Then, edit the newly created `.env` file and add your `GEMINI_API_KEY`:
        ```
        GEMINI_API_KEY=your_actual_gemini_api_key_here
        PORT=3000
        ```
        **IMPORTANT**: The application will not function correctly without a valid `GEMINI_API_KEY`.

3.  **Ensure `server.js` is your main file**:
    The `package.json` and `init-project.sh` script assume your main Node.js application file is `server.js`. If you are using `gemini-tts-api.js` (as per original uploads), please rename it to `server.js` or update the `main` field and `scripts` in `package.json`.

## Running the Application

* **Development Mode** (with Nodemon for automatic restarts on file changes):
    ```bash
    npm run dev
    ```

* **Production Mode**:
    ```bash
    npm start
    ```

The server will typically start on `http://localhost:3000` (or the port specified in your `.env` file).

## API Endpoints

The base URL for the API will be `http://localhost:PORT` (e.g., `http://localhost:3000`).

### Session Management

#### 1. Create New Session
* **Endpoint**: `POST /api/session`
* **Description**: Initializes a new session and creates a unique session ID.
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "sessionId": "unique-session-identifier",
      "message": "Session created successfully"
    }
    ```

#### 2. Get Session Information
* **Endpoint**: `GET /api/session/:sessionId`
* **Description**: Retrieves details about a specific session, including comprehensive metadata and file listings.
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "session": {
        "id": "unique-session-identifier",
        "created": "timestamp",
        "name": "Custom session name (if saved)",
        "taskType": "Session task type (if saved)",
        "speakers": ["Speaker names (if saved)"],
        "style": "Session style (if saved)",
        "files": {
          "audio": [],
          "transcripts": [],
          "prompts": []
        }
      }
    }
    ```

#### 3. Save Session
* **Endpoint**: `POST /api/session/:sessionId/save`
* **Description**: Saves session metadata with a custom name, task type, speakers, and style for easy identification and loading.
* **Request Body**:
    ```json
    {
      "name": "My TTS Project",
      "taskType": "podcast",
      "speakers": ["Alice", "Bob"],
      "style": "conversational"
    }
    ```
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "message": "Session saved successfully"
    }
    ```

#### 4. List Saved Sessions
* **Endpoint**: `GET /api/sessions`
* **Description**: Returns a list of all saved sessions with their metadata.
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "sessions": [
        {
          "id": "session-id-1",
          "name": "My TTS Project",
          "created": "timestamp",
          "taskType": "podcast",
          "speakers": ["Alice", "Bob"],
          "style": "conversational"
        }
      ]
    }
    ```

#### 5. Remove Session
* **Endpoint**: `DELETE /api/session/:sessionId`
* **Description**: Completely removes a session and all its associated files from the server.
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "message": "Session removed successfully"
    }
    ```

### AI-Driven Generation

#### 6. AI Orchestrated TTS
* **Endpoint**: `POST /api/ai-driven-generation`
* **Description**: Takes a natural language prompt from the user. The Gemini AI interprets this prompt to decide on actions (e.g., generate a script, select voices, determine style) and then orchestrates the TTS generation.
* **Request Body**:
    ```json
    {
      "sessionId": "your-active-session-id",
      "userPrompt": "Your natural language instruction. For example: 'Create a short welcome message for a podcast, spoken by a friendly female voice like Zephyr.' or 'Generate a quick dialogue between a robot (Puck) and a scientist (Kore) about discovering a new planet. The robot should sound neutral and the scientist excited.'"
    }
    ```
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "message": "AI-driven generation successful.",
      "aiPlan": { /* The plan generated by the AI orchestrator */ },
      "generatedScript": "The script text if one was generated as part of the plan",
      "audioUrl": "/api/audio/your-active-session-id/generated_audio_file.wav",
      "audioFile": "generated_audio_file.wav"
      // ... other relevant details
    }
    ```

### Transcript Generation

#### 7. Generate Transcript
* **Endpoint**: `POST /api/generate-transcript`
* **Description**: Generates a text transcript based on a user prompt, optionally with specified speakers and style.
* **Request Body**:
    ```json
    {
      "sessionId": "your-active-session-id",
      "prompt": "Generate a conversation about the future of AI.",
      "speakers": ["Dr. Aris", "Ms. Nova"], // Optional, array of strings
      "style": "podcast" // Optional (e.g., podcast, interview, conversation)
    }
    ```
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "transcript": "The generated transcript text...",
      "files": {
        "prompt": "prompt_timestamp.json",
        "transcript": "transcript_timestamp.json"
      }
    }
    ```

### Text-to-Speech (TTS)

#### 8. Single Speaker TTS
* **Endpoint**: `POST /api/tts/single`
* **Description**: Converts text to speech using a single specified voice.
* **Request Body**:
    ```json
    {
      "sessionId": "your-active-session-id",
      "text": "Hello, this is a test of single speaker text-to-speech.",
      "voice": "Kore", // Required: See /api/voices for available options
      "style": "Say this cheerfully" // Optional: A hint for the AI on delivery style
    }
    ```
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "audioFile": "single_timestamp.wav",
      "voice": "Kore",
      "text": "Hello, this is a test of single speaker text-to-speech.",
      "audioUrl": "/api/audio/your-active-session-id/single_timestamp.wav"
    }
    ```

#### 9. Multi-Speaker TTS
* **Endpoint**: `POST /api/tts/multi`
* **Description**: Converts text (formatted with speaker labels) to speech using multiple specified voices (max 2 speakers).
* **Request Body**:
    ```json
    {
      "sessionId": "your-active-session-id",
      "text": "Alice: Hi Bob, how are you? Bob: I'm doing great, Alice! Thanks for asking.",
      "speakers": [
        {"name": "Alice", "voice": "Zephyr"},
        {"name": "Bob", "voice": "Puck"}
      ] // Required: Array of speaker objects, max 2
    }
    ```
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "audioFile": "multi_timestamp.wav",
      "speakers": [ /* speaker objects as sent */ ],
      "text": "Alice: Hi Bob, how are you? Bob: I'm doing great, Alice! Thanks for asking.",
      "audioUrl": "/api/audio/your-active-session-id/multi_timestamp.wav"
    }
    ```

**Note**: All generation endpoints (transcript generation, single TTS, multi-speaker TTS, conversation TTS, and AI-driven generation) automatically trigger a file refresh operation in the test client, ensuring the latest generated files are immediately visible without manual intervention.

### File Management & Utilities

#### 7. List Session Files
* **Endpoint**: `GET /api/session/:sessionId/files`
* **Description**: Lists all files (audio, transcripts, prompts) associated with a given session.
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "files": {
        "audio": [
          {"name": "file1.wav", "size": 12345, "created": "timestamp", "url": "/api/audio/sessionId/file1.wav"}
        ],
        "transcripts": [
          {"name": "transcript1.json", "size": 678, "created": "timestamp", "url": "/api/file/sessionId/transcripts/transcript1.json"}
        ],
        "prompts": [
          {"name": "prompt1.json", "size": 345, "created": "timestamp", "url": "/api/file/sessionId/prompts/prompt1.json"}
        ]
      }
    }
    ```

#### 8. Get Audio File
* **Endpoint**: `GET /api/audio/:sessionId/:filename`
* **Description**: Serves a specific audio file.
* **Response**: The raw audio data (`audio/wav`).

#### 9. Get Transcript/Prompt File
* **Endpoint**: `GET /api/file/:sessionId/:type/:filename`
    * `:type` can be `transcripts` or `prompts`.
* **Description**: Serves a specific JSON transcript or prompt file.
* **Response**: The JSON file content (`application/json`).

#### 10. Get Available Voices
* **Endpoint**: `GET /api/voices`
* **Description**: Returns a list of all available TTS voices.
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "voices": ["Zephyr", "Puck", "Kore", /* ... and 27 more ... */ "Sulafat"]
    }
    ```

#### 11. Health Check
* **Endpoint**: `GET /health`
* **Description**: A simple health check endpoint to verify if the API server is running.
* **Response (Success 200)**:
    ```json
    {
      "success": true,
      "message": "Gemini TTS API is running",
      "timestamp": "current_server_timestamp",
      "sessions": 0 // Number of active sessions in memory
    }
    ```

## Available Voices

The API supports 30 different voices from the Gemini TTS model. Some examples with general characteristics:

* **Bright/Upbeat**: Zephyr, Puck, Autonoe, Laomedeia
* **Firm/Clear**: Kore, Orus, Alnilam, Leda, Erinome, Iapetus
* **Smooth/Breathy**: Aoede, Enceladus, Algieba, Despina
* **Easy-going**: Callirrhoe, Umbriel
* **Informative**: Charon, Rasalgethi
* **Youthful**: Leda
* **Mature**: Gacrux
* **Warm**: Sulafat

For the complete and current list, query the `/api/voices` endpoint.

## Testing the API

This project uses **Jest** for automated testing. Test files are located in the `__tests__` directory.

1.  **Ensure Test Dependencies are Installed**:
    If you haven't already, `npm install` (or the `init-project.sh` script) should have installed `jest` and `supertest` from `devDependencies`.

2.  **Configure `.env` for Tests**:
    Some tests (especially those hitting actual Gemini API endpoints like transcript and TTS generation) require a valid `GEMINI_API_KEY` in your `.env` file. Tests that don't make external calls will still run.

3.  **Run Tests**:
    Execute the following command from the project root:
    ```bash
    npm test
    ```
    This command will run all `*.test.js` files. The Jest configuration in `package.json` includes flags like `--runInBand`, `--detectOpenHandles`, and `--forceExit` to help with testing Node.js/Express applications.

**Test Coverage**:
* Basic server health and environment checks.
* Session management (creation, retrieval).
* Voice list retrieval.
* Core API functionalities:
    * Transcript generation (may call external API).
    * Single-speaker TTS (may call external API).
    * Multi-speaker TTS (may call external API).
    * AI-Driven Generation (may call external API).
* File listing and retrieval.
* End-to-end workflow simulation.

## Test Client HTML

An advanced HTML test client is provided in `public/test-client.html`. Once the server is running, you can access this client in your browser (e.g., at `http://localhost:3000/test-client.html`) to manually interact with all API endpoints.

### Test Client Features

The test client includes comprehensive session management capabilities with enhanced user experience:

- **Session Creation & Management**: Create new sessions and switch between existing ones with intuitive modal interface
- **Enhanced Session Information Display**: View detailed session info including ID, creation date, custom name, task type, speakers, and style in an organized grid layout
- **Integrated Session File Browser**: Browse and download all generated files (audio, transcripts, prompts) directly within the session management interface
- **Automatic File Loading**: Session files are automatically loaded when a session is selected, providing immediate access to all generated content
- **Real-time File Refresh**: Session files are automatically refreshed after each generation operation (transcript generation, single TTS, multi-speaker TTS, conversation TTS, and AI-driven generation)
- **Session Persistence**: Save and load sessions with custom names, task types, speakers, and style descriptions for easy organization
- **Session Removal**: Clean up unwanted sessions and their associated files with confirmation dialogs
- **Direct Audio Playback**: Play generated audio files directly in the browser with built-in audio controls
- **File Download**: Download any generated file with a single click
- **Manual File Refresh**: Additional "Refresh Files" button for manual file list updates when needed

The test client provides an intuitive interface for testing all API functionality without requiring external tools like Postman or curl. The enhanced session management system ensures that users can efficiently organize their TTS projects with automatic file synchronization and comprehensive session metadata tracking.

## File Structure for Sessions

Each session creates the following directory structure on the server:
```
sessions/
└── [session-id]/             # Unique ID for the session
    ├── audio/                # Stores generated .wav audio files
    │   └── single_xxxx.wav
    │   └── multi_yyyy.wav
    ├── transcripts/          # Stores generated transcripts (JSON format)
    │   └── transcript_xxxx.json
    └── prompts/              # Stores original user prompts, AI plans, and related metadata (JSON format)
        └── prompt_xxxx.json
        └── ai_plan_yyyy.json
```

## Error Handling

The API aims to return consistent error responses in JSON format:
```json
{
  "success": false,
  "error": "A descriptive error message here"
  // "details": { ... } // Optional additional details for some errors
}
```
HTTP status codes (4xx for client errors, 5xx for server errors) are also used appropriately.

## Limitations

* **Multi-Speaker TTS**: Currently supports a maximum of 2 speakers.
* **Gemini Model Limits**: Subject to token context window limits and other usage policies of the underlying Google Gemini AI models.
* **Output Format**: TTS output is currently in WAV audio format only.
* **Session Persistence**: The `sessions` map (tracking active session IDs and their directory paths) is stored in memory. This means if the server restarts, the in-memory map is lost. While the files on the disk persist, and the enhanced session management system can reload saved sessions with their metadata, accessing unsaved sessions via session ID without the enhancement would require knowing the exact file paths. For production, consider a more robust session store (e.g., Redis, a database) if long-term session recall after restarts is critical.
* **API Key Security**: The `GEMINI_API_KEY` is loaded from the `.env` file. Ensure this file is not committed to public repositories (it should be in your `.gitignore`).

## Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the repository.
2.  Create a new feature branch (`git checkout -b feature/your-feature-name`).
3.  Make your changes and commit them (`git commit -am 'Add some feature'`).
4.  Push to the branch (`git push origin feature/your-feature-name`).
5.  Create a new Pull Request.

Please ensure your code follows the existing style and that tests are added or updated for any new functionality.

## License

This project is licensed under the MIT License - see the `LICENSE` file (if one exists in your project, or choose one like MIT) for details.