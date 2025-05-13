# @navios/cli

CLI tools for Navios projects

## Installation

```bash
npm install @navios/cli
```

Or globally:

```bash
npm install -g @navios/cli
```

## Usage

### Serve Command

Starts a Vite development server. If a `vite.config.ts` or `vite.config.js` file is found in the project directory it will also follow it.

```bash
navios serve
```

Options:
- `-p, --port <port>`: Specify the port to run the server on

### Build Command

Runs a Vite build if a `vite.config.ts` or `vite.config.js` file is found in the current directory.

```bash
navios build
```

## Development

```bash
# Build the CLI
npm run build

# Watch for changes during development
npm run dev
```
