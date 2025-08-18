# Automatic Ebook Downloader

An automated ebook downloader for multiple platforms using Playwright.

## Features

- 🤖 **Full automation**: Automatic login and download of all books
- 📚 **Multiple formats**: Downloads PDF and EPUB when available
- 🏗️ **Extensible architecture**: Easy to add new sites
- 📁 **Auto organization**: Creates subfolders by site
- 🔒 **Secure**: Doesn't store credentials, asks each time
- 📝 **Complete logging**: Records all activities

## Supported Sites

- ✅ **Manning Publications** (manning.com)
- 🔄 **Coming soon**: Other ebook sites

## Installation

1. **Clone or download the project**
```bash
cd automatic-ebook-downloader
```

2. **Install dependencies**
```bash
npm install
```

3. **Install Playwright browsers**
```bash
npm run install-browsers
```

## Usage

### Interactive Mode (Recommended)
```bash
npm start
```

The program will ask for:
- Select the site (Manning)
- Enter your email
- Enter your password

### Direct Mode for Manning
```bash
npm run manning
```

## Project Structure

```
automatic-ebook-downloader/
├── src/
│   ├── index.js              # Main entry point
│   ├── sites/
│   │   └── manning.js        # Manning downloader
│   └── utils/
│       └── logger.js         # Logging system
├── config/
│   └── config.json          # Configuration
├── downloads/               # Downloads folder
│   └── manning/            # Manning books
├── logs/                   # Log files
└── package.json
```

## Configuration

You can modify `config/config.json` to:
- Change timeouts
- Modify browser behavior
- Adjust rate limits

## How It Works

1. **Login**: Automatically connects to your account
2. **Discovery**: Finds all books in your library
3. **Download**: For each book:
   - Clicks on PDF/EPUB
   - Opens dropdown menu
   - Clicks "Download"
   - Saves file with clean name

## Adding New Sites

To add support for other sites:

1. Create a new file in `src/sites/site-name.js`
2. Implement the class with methods:
   - `login(email, password)`
   - `getBooksList()`
   - `downloadBook(book)`
3. Add the site to `src/index.js`
4. Update `config/config.json`

## Troubleshooting

### Browser doesn't open
```bash
npm run install-browsers
```

### Download failures
- Verify your credentials
- Check logs in `logs/`
- Make sure you have books in your library

### Files don't download
- Check write permissions in `downloads/` folder
- Some books may not be available for download

## Logs

Logs are saved in `logs/download-YYYY-MM-DD.log` with detailed information about:
- Login process
- Books found
- Successful/failed downloads
- Errors and warnings

## Security

- ✅ Doesn't store credentials
- ✅ Uses HTTPS connections
- ✅ Respects rate limits
- ✅ Doesn't modify site content

## Contributing

1. Fork the project
2. Create a branch for your feature
3. Add tests if necessary
4. Submit a pull request

## License

MIT License - Use it freely for your legally purchased books.

## Disclaimer

This software is designed to download only books you have legally purchased. Please respect the terms of service of each platform.
