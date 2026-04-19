# TODA MAX AI Service

A Node.js microservice powering the TODA MAX patient-support chatbot.

## Description

TODA MAX AI Service delivers conversational support for patients managing hypertension and diabetes. It exposes REST endpoints, validates payloads, and orchestrates AI provider interactions for the broader TODA MAX ecosystem.

## Technologies Used

- **Express.js**: HTTP server framework
- **TypeScript**: Typed JavaScript runtime targeting Node.js
- **Axios**: HTTP client for upstream requests
- **Zod**: Schema validation for request payloads
- **dotenv**: Environment configuration management

## Installation

1. Clone the repository:

	```bash
	git clone https://github.com/LaunchBytes-Studios/TODA-MAX-AIService.git
	cd TODA-MAX-AIService
	```

2. Install dependencies:

	```bash
	npm install
	```

3. Start the development server:

	```bash
	npm run dev
	```

## Environment Variables

Set the following variables in your environment or a local `.env` file:

- `OPENAI_API_KEY`: OpenAI API key for chat completions
- `AI_SERVICE_KEY`: Shared service key used by the backend to call this service
- `PORT`: Optional override for the default port (3001)

## Scripts

- `npm run dev`: Start the API in watch mode with ts-node
- `npm run build`: Generate compiled JavaScript in `dist/`
- `npm start`: Run the compiled server from `dist/index.js`
- `npm run lint`: Lint the codebase with ESLint
- `npm run lint:fix`: Lint and automatically fix issues where possible
- `npm run format`: Format source files with Prettier

## Project Structure

```text
src/
├── index.ts            # Express application entry point
├── config/             # Configuration helpers and loaders
├── controllers/        # Request handlers and controller logic
├── middleware/         # Express middleware modules
├── routes/             # Route registrations per feature
├── services/           # Domain services and integrations
│   └── llm/            # Large Language Model orchestration utilities
├── types/              # Shared TypeScript type definitions
├── utils/              # Utility helpers
└── validators/         # Schema validators for inputs
```
