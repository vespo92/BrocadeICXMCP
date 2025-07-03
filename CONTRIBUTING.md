# Contributing to Brocade ICX MCP Server

Thank you for your interest in contributing to the Brocade ICX MCP Server project! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## How to Contribute

### Reporting Issues

Before creating an issue, please check if it already exists. When creating an issue, include:

- Clear description of the problem
- Steps to reproduce
- Expected behavior
- Actual behavior
- Brocade switch model and firmware version
- Node.js version
- Relevant logs or error messages

### Suggesting Enhancements

Enhancement suggestions are welcome! Please create an issue with:

- Clear description of the enhancement
- Use case and motivation
- Examples of how it would work
- Any relevant technical details

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Ensure code follows style guidelines (`npm run lint`)
7. Commit your changes (`git commit -m 'Add amazing feature'`)
8. Push to your branch (`git push origin feature/amazing-feature`)
9. Open a Pull Request

#### Pull Request Guidelines

- Keep PRs focused - one feature/fix per PR
- Update documentation as needed
- Add tests for new functionality
- Ensure CI passes
- Link relevant issues

## Development Setup

1. Clone the repository:
```bash
git clone https://github.com/vespo92/BrocadeICXMCP.git
cd BrocadeICXMCP
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment configuration:
```bash
cp .env.example .env
```

4. Run in development mode:
```bash
npm run dev
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage
```

### Writing Tests

- Place unit tests next to the code they test or in the `tests/` directory
- Use descriptive test names
- Test edge cases and error conditions
- Mock external dependencies (SSH connections, etc.)

## Code Style

This project uses ESLint and TypeScript for code quality:

```bash
# Run linter
npm run lint

# Type check
npm run typecheck
```

### Style Guidelines

- Use TypeScript for all new code
- Follow existing code patterns
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Commit Messages

Follow conventional commit format:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test additions or changes
- `chore:` Build process or auxiliary tool changes

Example: `feat: add support for VLAN range configuration`

## Adding Support for New Switch Models

To add support for new Brocade switch models:

1. Research the CLI differences for the model
2. Update command parsers in `src/lib/brocade-commands.ts`
3. Add model-specific logic if needed
4. Add tests for the new model
5. Update documentation

## Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for new functions
- Update examples if API changes
- Document any new environment variables

## Release Process

Maintainers will handle releases:

1. Update version in package.json
2. Update CHANGELOG.md
3. Create git tag
4. GitHub Actions will build and create release

## Questions?

Feel free to open an issue for any questions about contributing!