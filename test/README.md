# Test Suite

This directory contains tests for the CodeLens application using Vitest.

## Test Structure

```
test/
├── lib/
│   ├── utils/
│   │   └── image.test.ts       # Image utility function tests
│   └── logger.test.ts          # Logger utility tests
├── services/
│   ├── generalAnalyzer.test.ts # General analysis service tests
│   ├── providers.test.ts       # Provider management tests
│   └── openrouter/
│       └── client.test.ts      # OpenRouter client configuration tests
├── integration/
│   └── basic.test.ts           # Basic integration tests
├── setup.ts                    # Test environment setup
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
- **Logger utilities** (`lib/logger.test.ts`): Tests logging functions and error patterns
- **OpenRouter client** (`services/openrouter/client.test.ts`): Tests API key validation and configuration
- **Provider management** (`services/providers.test.ts`): Tests model loading, cache behavior, and provider metadata

### Integration Tests
- **Basic integration** (`integration/basic.test.ts`): Tests module imports and basic functionality

## Mocking Strategy

The tests use Vitest's `vi.mock()` and `vi.fn()` helpers to mock Electron dependencies and network calls without requiring the full Electron runtime.

## Test Coverage

The test suite covers:
- ✅ Utility functions (image processing, validation)
- ✅ Configuration validation (OpenRouter API keys)
- ✅ Logger functionality (performance and API call logging)
- ✅ Provider and model selection behavior
- ✅ Error pattern matching
- ✅ Basic module imports and integration

## Notes

- Tests are designed to work without Electron runtime
- Environment variables are mocked for testing API key validation
- Logger tests focus on functionality rather than mock verification
- All tests use TypeScript for type safety
