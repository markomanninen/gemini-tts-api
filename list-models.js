// list-models.js
require('dotenv').config(); // To load GEMINI_API_KEY from .env file
const https = require('https');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    console.error('\x1b[31m%s\x1b[0m', 'Error: GEMINI_API_KEY is not set or is still the default placeholder in your .env file.');
    console.log('Please set your valid GEMINI_API_KEY in the .env file to list available models.');
    process.exit(1);
}

const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: '/v1beta/models?key=' + apiKey,
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
    },
};

console.log('\x1b[33m%s\x1b[0m', 'Fetching available models from Google Generative Language API...');
console.log(`Using API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)} (obfuscated)`);


const req = https.request(options, (res) => {
    let data = '';

    console.log('\nStatus Code:', res.statusCode);
    // console.log('Headers:', JSON.stringify(res.headers, null, 2)); // Uncomment for detailed headers

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
                const parsedData = JSON.parse(data);
                if (parsedData.models && parsedData.models.length > 0) {
                    console.log('\x1b[32m%s\x1b[0m', '\nAvailable Models:');
                    parsedData.models.forEach(model => {
                        console.log(`\n  \x1b[36mModel Name:\x1b[0m ${model.name}`);
                        console.log(`    Display Name: ${model.displayName}`);
                        console.log(`    Description: ${model.description ? model.description.substring(0,150)+'...' : 'N/A'}`);
                        console.log(`    Version: ${model.version}`);
                        console.log(`    Supported Generation Methods: ${model.supportedGenerationMethods.join(', ')}`);
                        if (model.inputTokenLimit) console.log(`    Input Token Limit: ${model.inputTokenLimit}`);
                        if (model.outputTokenLimit) console.log(`    Output Token Limit: ${model.outputTokenLimit}`);
                        // Add more fields if needed, e.g., model.temperature, model.topP, model.topK
                    });
                    console.log(`\n\x1b[32mFound ${parsedData.models.length} model(s).\x1b[0m`);
                } else {
                    console.log('\x1b[33m%s\x1b[0m', 'No models found or the response format was unexpected.');
                    console.log('Raw response:', data);
                }
            } catch (e) {
                console.error('\x1b[31m%s\x1b[0m', 'Error parsing JSON response:', e.message);
                console.log('Raw response data:', data);
            }
        } else {
            console.error('\x1b[31m%s\x1b[0m', `Error fetching models. Status: ${res.statusCode} ${res.statusMessage}`);
            try {
                const errorResponse = JSON.parse(data);
                console.error('Error details:', JSON.stringify(errorResponse, null, 2));
                 if (res.statusCode === 400 && errorResponse.error && errorResponse.error.message.toLowerCase().includes("api key not valid")) {
                    console.error('\x1b[31m%s\x1b[0m', '\nDouble-check that your GEMINI_API_KEY in the .env file is correct and has the necessary permissions.');
                } else if (res.statusCode === 403) {
                     console.error('\x1b[31m%s\x1b[0m', '\nReceived a 403 Forbidden error. The API key might not have permissions to list models, or the Generative Language API might not be enabled for your project.');
                }
            } catch (e) {
                console.error('Could not parse error response. Raw data:', data);
            }
        }
    });
});

req.on('error', (e) => {
    console.error('\x1b[31m%s\x1b[0m', 'Problem with request:', e.message);
    if (e.code === 'ENOTFOUND') {
        console.error('Network error: Could not resolve hostname. Check your internet connection.');
    }
});

req.end();
