# Contributing to Comprehension Audit

Thank you for your interest in contributing. This project welcomes
contributions from anyone who wants to improve LLM-based diagnostic
tooling.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/comprehension-audit.git`
3. Install dependencies: `npm install`
4. Copy environment config: `cp .env.example .env`
5. Add your Anthropic API key to `.env`
6. Start development: `npm run dev`

## Development Workflow

- Create a feature branch from `main`
- Make your changes with clear, atomic commits
- Run type checking: `npm run type-check`
- Run calibration validation: `npm run validate-calibration`
- Submit a pull request with a clear description

## Code Style

- TypeScript strict mode is enabled
- All public functions and interfaces must have JSDoc comments
- Use descriptive variable names — no abbreviations
- Keep modules focused: one responsibility per file

## Calibration Examples

If you add or modify calibration examples:

1. Place examples in `examples/calibration/{L1-L5}/`
2. Follow the existing JSON schema
3. Use only synthetic data — never real submissions
4. Run `npm run validate-calibration` to verify scoring consistency
5. Ensure each band has 4-5 examples covering edge cases

## Reporting Issues

- Use GitHub Issues for bug reports and feature requests
- Include reproduction steps for bugs
- For security vulnerabilities, email security@example.com

## License

By contributing, you agree that your contributions will be licensed
under the MIT License.
