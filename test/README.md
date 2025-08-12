# Test Suite

This directory contains tests for the CodeLens application using Bun's built-in testing framework.

## Test Structure

```
test/
├── lib/
│   ├── utils/
│   │   └── image.test.ts       # Image utility function tests
│   └── logger.test.ts          # Logger utility tests
├── services/
│   └── openai/
│       └── client.test.ts      # OpenAI client configuration tests
├── integration/
│   └── basic.test.ts           # Basic integration tests
├── setup.ts                   # Test environment setup
└── README.md                   # This file
```

## Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage
```

## Test Categories

### Unit Tests
- **Image utilities** (`lib/utils/image.test.ts`): Tests MIME type detection and file validation
- **Logger utilities** (`lib/logger.test.ts`): Tests logging functions and error patterns
- **OpenAI client** (`services/openai/client.test.ts`): Tests API key validation and configuration

### Integration Tests
- **Basic integration** (`integration/basic.test.ts`): Tests module imports and basic functionality

## Mocking Strategy

The tests use Bun's built-in `mock.module()` to mock Electron dependencies, allowing the tests to run in a Node.js environment without requiring the full Electron runtime.

## Test Coverage

The test suite covers:
- ✅ Utility functions (image processing, validation)
- ✅ Configuration validation (OpenAI API keys)
- ✅ Logger functionality (performance and API call logging)
- ✅ Error pattern matching
- ✅ Basic module imports and integration

## Notes

- Tests are designed to work without Electron runtime
- Environment variables are mocked for testing API key validation
- Logger tests focus on functionality rather than mock verification
- All tests use TypeScript for type safety