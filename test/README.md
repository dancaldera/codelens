# Test Suite

This directory contains tests for the CodeLens application using Vitest.

## Test Structure

```
test/
├── ipc.test.ts                 # IPC payload validation tests
├── setup.ts                    # Test environment setup
├── lib/
│   └── utils/
│       └── image.test.ts       # Image utility function tests
├── main/
│   ├── analysisSession.test.ts # Analysis queue behavior tests
│   ├── screenshotSession.test.ts # Screenshot slot lifecycle tests
│   └── voiceSession.test.ts    # Voice session tests
├── services/
│   ├── smartAnalyzer.test.ts   # Smart screenshot analysis service tests
│   ├── providers.test.ts       # Provider/model loading tests
│   ├── stt.test.ts             # Speech-to-text request tests
│   └── openrouter/
│       └── client.test.ts      # OpenRouter client configuration tests
└── README.md                   # This file
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Categories

### Unit Tests
- **Image utilities** (`lib/utils/image.test.ts`): Tests MIME type detection and file validation
- **OpenRouter client** (`services/openrouter/client.test.ts`): Tests API key validation and configuration
- **Provider management** (`services/providers.test.ts`): Tests model loading and cache behavior

## Mocking Strategy

The tests use Vitest's `vi.mock()` and `vi.fn()` helpers to mock Electron dependencies and network calls without requiring the full Electron runtime.

## Test Coverage

The test suite covers:
- Utility functions (image processing, validation)
- Configuration validation (OpenRouter API keys)
- Provider and model selection behavior
- IPC payload validation
- Screenshot slot lifecycle and analysis queue behavior

## Notes

- Tests are designed to work without Electron runtime
- Environment variables are mocked for testing API key validation
- All tests use TypeScript for type safety
