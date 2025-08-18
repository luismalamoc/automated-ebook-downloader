const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

class ManningDownloader {
  constructor() {
    this.browser = null;
    this.page = null;
    this.downloadsDir = null;
  }

  async download({ email, password, downloadsDir }) {
    this.downloadsDir = downloadsDir;
    
    try {
      // Launch browser
      console.log(chalk.blue('🌐 Launching browser...'));
      this.browser = await chromium.launch({ 
        headless: false, // Show browser for debugging
        downloadPath: this.downloadsDir
      });
      
      const context = await this.browser.newContext({
        acceptDownloads: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      });
      this.page = await context.newPage();

      // Login
      await this.login(email, password);
      
      // Navigate to dashboard/library
      await this.navigateToLibrary();
      
      // Get all books
      const books = await this.getBooksList();
      await this.downloadBooks(books);
      
    } catch (error) {
      console.error(chalk.red('❌ Error during download:'), error.message);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  async downloadBooks(books) {
    console.log(chalk.blue(`📚 Found ${books.length} books to download`));
    console.log(chalk.green(`🚀 Starting full download of all books...`));
    
    for (let i = 0; i < books.length; i++) {
      const book = books[i];
      console.log(chalk.cyan(`📖 Downloading book ${i + 1}/${books.length}: ${book.title}`));
      
      // Debug: Show what URLs we have for this book
      console.log(chalk.gray(`  🔗 PDF URL: ${book.pdfUrl || 'None'}`));
      console.log(chalk.gray(`  🔗 EPUB URL: ${book.epubUrl || 'None'}`));
      
      // Download both formats for this book without refreshing page
      await this.downloadBookFormats(book);
      
      // Small delay between books
      await this.page.waitForTimeout(800);
    }
  }

  async downloadBookFormats(book) {
    // Navigate to dashboard once per book
    await this.page.goto('https://www.manning.com/dashboard');
    await this.page.waitForTimeout(2000);
    await this.page.waitForSelector('#productTable tbody tr', { timeout: 8000 });
    
    // Get the book row
    const bookRows = await this.page.locator('table tbody tr').all();
    if (book.index >= bookRows.length) {
      console.log(chalk.yellow(`⚠️  Book index ${book.index} out of range`));
      return;
    }
    const row = bookRows[book.index];
    
    // Track which dropdown was used for PDF
    let usedDropdownIndex = -1;
    
    // Download PDF if available
    if (book.hasPdf && book.pdfUrl) {
      console.log(chalk.blue(`  📄 Downloading PDF: ${book.title}`));
      const result = await this.downloadFormatFromRow(book, 'PDF', row, usedDropdownIndex);
      if (result.success) {
        usedDropdownIndex = result.dropdownIndex;
        console.log(chalk.green(`  📄 PDF SUCCESS (used dropdown ${usedDropdownIndex + 1})`));
      } else {
        console.log(chalk.red(`  📄 PDF FAILED`));
      }
    }
    
    // Download EPUB if available (using same row, no refresh, but different dropdown)
    if (book.hasEpub && book.epubUrl) {
      console.log(chalk.blue(`  📱 Downloading EPUB: ${book.title}`));
      
      try {
        const result = await this.downloadFormatFromRow(book, 'EPUB', row, usedDropdownIndex);
        console.log(chalk[result.success ? 'green' : 'red'](`  📱 EPUB ${result.success ? 'SUCCESS' : 'FAILED'}`));
      } catch (epubError) {
        console.log(chalk.red(`  📱 EPUB FAILED: ${epubError.message}`));
      }
      
      // Add delay between PDF and EPUB downloads
      await this.page.waitForTimeout(1000);
    }
  }

  async login(email, password) {
    console.log(chalk.blue('🔐 Starting login process...'));
    
    // Try to load existing cookies first
    const cookiesPath = 'manning-cookies.json';
    
    try {
      if (await fs.pathExists(cookiesPath)) {
        const cookiesData = await fs.readFile(cookiesPath, 'utf8');
        const cookies = JSON.parse(cookiesData);
        
        console.log(chalk.blue(`🍪 Loading ${cookies.length} saved cookies...`));
        await this.page.context().addCookies(cookies);
        
        // Test if cookies are still valid
        await this.page.goto('https://www.manning.com/dashboard');
        await this.page.waitForTimeout(3000);
        
        const isLoggedIn = await this.page.locator('table').count() > 0;
        if (isLoggedIn) {
          console.log(chalk.green('✅ Login successful using saved cookies!'));
          return;
        } else {
          console.log(chalk.yellow('⚠️  Saved cookies are expired, proceeding with manual login'));
        }
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️  Could not load saved cookies, proceeding with manual login'));
    }
    
    // Manual login if cookies failed or don't exist
    console.log(chalk.blue('🔐 Logging in with credentials...'));
    
    // Navigate to login page
    await this.page.goto('https://www.manning.com/dashboard');
    
    // Wait for login form
    await this.page.waitForSelector('input[type="email"], input[name="email"], [data-testid="email"], textbox', { timeout: 10000 });
    
    // Fill login form - try multiple selectors
    try {
      await this.page.fill('input[type="email"]', email);
    } catch {
      try {
        await this.page.fill('input[name="email"]', email);
      } catch {
        await this.page.fill('textbox >> nth=0', email);
      }
    }
    
    try {
      await this.page.fill('input[type="password"]', password);
    } catch {
      try {
        await this.page.fill('input[name="password"]', password);
      } catch {
        await this.page.fill('textbox >> nth=1', password);
      }
    }
    
    // Click login button
    await this.page.click('button:has-text("log in now"), input[type="submit"], button[type="submit"]');
    
    // Wait for successful login (dashboard page)
    await this.page.waitForURL('**/dashboard**', { timeout: 15000 });
    
    // Save new cookies for future use
    const cookies = await this.page.context().cookies();
    const cookiesJson = JSON.stringify(cookies, null, 2);
    await fs.writeFile(cookiesPath, cookiesJson);
    console.log(chalk.blue(`🍪 Saved ${cookies.length} cookies for future use`));
    
    console.log(chalk.green('✅ Successfully logged in'));
  }

  async navigateToLibrary() {
    console.log(chalk.blue('📚 Navigating to library...'));
    
    // Manning dashboard should already be loaded after login
    await this.page.waitForURL('**/dashboard**', { timeout: 10000 });
    
    // Wait for the main products header to appear
    await this.page.waitForSelector('.your-products', { timeout: 15000 });
    console.log(chalk.green('✓ Products header found'));
    
    // Wait for the product table structure to be created
    await this.page.waitForSelector('#productTable', { timeout: 10000 });
    console.log(chalk.green('✓ Product table found'));
    
    // Wait for AJAX content to load - Manning loads books dynamically
    console.log(chalk.yellow('⏳ Waiting for books to load via AJAX...'));
    await this.page.waitForTimeout(8000);
  }

  async getBooksList() {
    console.log(chalk.blue('🔍 Discovering books...'));
    
    // Wait for books to load via AJAX - Manning loads content dynamically
    console.log(chalk.yellow('⏳ Waiting for AJAX content to load...'));
    await this.page.waitForTimeout(10000);
    
    // Wait for the product table to be populated
    try {
      await this.page.waitForSelector('#productTable tbody tr', { timeout: 30000 });
    } catch (error) {
      console.log(chalk.red('❌ No books found in table, taking screenshot...'));
      await this.page.screenshot({ path: 'debug-no-books.png', fullPage: true });
      throw new Error('No books found in dashboard table');
    }
    
    // Get all book rows from the table - Manning uses dynamic loading
    const bookRows = await this.page.locator('#productTable tbody tr').all();
    console.log(chalk.green(`Found ${bookRows.length} rows in product table`));
    
    let books = [];
    
    for (let i = 0; i < bookRows.length; i++) {
      const row = bookRows[i];
      try {
        // Skip loading rows or empty rows
        const isLoadingRow = await row.locator('.infinite-scroll-loading').count() > 0;
        if (isLoadingRow) {
          console.log(chalk.yellow(`⏳ Skipping loading row ${i}`));
          continue;
        }
        
        // Extract book title - Manning puts title in first cell
        let title = `Book ${i + 1}`;
        
        try {
          // Extract title from the href URL - this is the most reliable method
          const bookLink = await row.locator('td:first-child a[href*="/books/"]').first();
          if (await bookLink.count() > 0) {
            const href = await bookLink.getAttribute('href');
            if (href && href.includes('/books/')) {
              // Extract book slug from URL like /books/grokking-algorithms
              const urlParts = href.split('/books/');
              if (urlParts.length > 1) {
                const bookSlug = urlParts[1].split('/')[0];
                // Convert slug to readable title
                title = bookSlug
                  .replace(/-/g, ' ')
                  .replace(/\b\w/g, l => l.toUpperCase())
                  .trim();
                console.log(chalk.green(`  ✅ Found title from URL: "${title}"`));
              }
            }
          }
          
          // If no clean title found, try to extract from the image alt text or other attributes
          if (title === `Book ${i + 1}`) {
            // Try image alt text first
            const bookImage = await row.locator('td:first-child img').first();
            if (await bookImage.count() > 0) {
              const altText = await bookImage.getAttribute('alt');
              if (altText && altText.trim() && altText.length > 3) {
                title = altText.trim();
                console.log(chalk.green(`  📖 Found title from image alt: "${title}"`));
              }
            }
            
            // If still no title, try href attribute of the link
            if (title === `Book ${i + 1}`) {
              const bookLink = await row.locator('td:first-child a').first();
              if (await bookLink.count() > 0) {
                const href = await bookLink.getAttribute('href');
                if (href && href.includes('/book/')) {
                  // Extract book name from URL like /book/modern-c-third-edition
                  const urlParts = href.split('/book/');
                  if (urlParts.length > 1) {
                    const bookSlug = urlParts[1].split('/')[0];
                    title = bookSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    console.log(chalk.green(`  📖 Found title from URL: "${title}"`));
                  }
                }
              }
            }
          }
          
        } catch (titleError) {
          console.log(chalk.yellow(`⚠️  Error extracting title for row ${i}: ${titleError.message}`));
        }
        console.log(chalk.cyan(`📖 Processing: ${title.trim()}`));
        
        // Look for download buttons/links - Manning may use various patterns
        let hasPdf = false;
        let hasEpub = false;
        let pdfUrl = null;
        let epubUrl = null;
        
        // Manning uses specific patterns - look for download elements in the last columns
        // The download buttons are typically in the rightmost cells
        const downloadCells = await row.locator('td').all();
        
        // Check each cell for download links/buttons
        for (const cell of downloadCells) {
          const cellLinks = await cell.locator('a').all();
          
          for (const link of cellLinks) {
            const href = await link.getAttribute('href') || '';
            const className = await link.getAttribute('class') || '';
            const title = await link.getAttribute('title') || '';
            const ariaLabel = await link.getAttribute('aria-label') || '';
            
            // Manning might use data attributes or specific URL patterns
            const allAttributes = [href, className, title, ariaLabel].join(' ').toLowerCase();
            
            // Look for PDF indicators
            if (allAttributes.includes('pdf') || href.includes('/pdf/') || href.includes('.pdf') || href.includes('downloadFormat=PDF')) {
              hasPdf = true;
              pdfUrl = href;
              console.log(chalk.green(`  ✓ Found PDF link - href: ${href}`));
            }
            
            // Look for EPUB indicators  
            if (allAttributes.includes('epub') || href.includes('/epub/') || href.includes('.epub') || href.includes('downloadFormat=EPUB')) {
              hasEpub = true;
              epubUrl = href;
              console.log(chalk.green(`  ✓ Found EPUB link - href: ${href}`));
            }
            
            // Look for generic download links that might lead to format selection
            if (href.includes('/download') && href.includes('productId=')) {
              // This is a Manning download link - determine format from URL
              if (href.includes('downloadFormat=PDF') && !pdfUrl) {
                hasPdf = true;
                pdfUrl = href;
                console.log(chalk.green(`  ✓ Found PDF download - href: ${href}`));
              } else if (href.includes('downloadFormat=EPUB') && !epubUrl) {
                hasEpub = true;
                epubUrl = href;
                console.log(chalk.green(`  ✓ Found EPUB download - href: ${href}`));
              } else if (!href.includes('downloadFormat=')) {
                // Generic download link - assume both formats available
                if (!pdfUrl) {
                  hasPdf = true;
                  pdfUrl = href;
                  console.log(chalk.yellow(`  ? Found potential PDF download - href: ${href}`));
                }
                if (!epubUrl) {
                  hasEpub = true;
                  epubUrl = href;
                  console.log(chalk.yellow(`  ? Found potential EPUB download - href: ${href}`));
                }
              }
            }
          }
          
          // Also check for buttons in each cell
          const cellButtons = await cell.locator('button').all();
          for (const button of cellButtons) {
            const className = await button.getAttribute('class') || '';
            const title = await button.getAttribute('title') || '';
            const dataToggle = await button.getAttribute('data-toggle') || '';
            
            if (dataToggle === 'dropdown' || className.includes('dropdown')) {
              // This is likely a dropdown with format options
              console.log(chalk.blue(`  🔽 Found dropdown button - class: ${className}`));
            }
          }
        }
        
        // If no downloads found yet, inspect the row HTML structure
        if (!hasPdf && !hasEpub) {
          console.log(chalk.yellow(`  🔍 No downloads found for "${title.trim()}", inspecting HTML...`));
          
          // Get the HTML content of the row for debugging
          const rowHTML = await row.innerHTML();
          console.log(chalk.gray(`  📋 Row HTML snippet: ${rowHTML.substring(0, 200)}...`));
          
          // Look for any elements that might be download buttons
          const allElements = await row.locator('*').all();
          for (const element of allElements.slice(0, 10)) { // Limit to first 10 elements
            try {
              const tagName = await element.evaluate(el => el.tagName);
              const className = await element.getAttribute('class') || '';
              const href = await element.getAttribute('href') || '';
              const title = await element.getAttribute('title') || '';
              const text = await element.textContent() || '';
              
              if (className || href || title || (text && text.trim())) {
                console.log(chalk.gray(`    ${tagName}: class="${className}", href="${href}", title="${title}", text="${text.trim()}"`));
              }
            } catch (err) {
              // Skip elements that can't be inspected
            }
          }
        }
        
        // Check for dropdown buttons that might contain download options
        const dropdownButtons = await row.locator('button[data-toggle="dropdown"], .dropdown-toggle, .btn-group button').all();
        
        // Always add books to the list for now, even without detected downloads
        books.push({
          title: title.trim(),
          element: row,
          hasPdf,
          hasEpub,
          pdfUrl,
          epubUrl,
          dropdownButtons,
          index: i
        });
        console.log(chalk.cyan(`  📖 ${title.trim()} - PDF: ${hasPdf ? '✓' : '✗'} EPUB: ${hasEpub ? '✓' : '✗'} Dropdowns: ${dropdownButtons.length}`));
      } catch (err) {
        console.log(chalk.yellow(`⚠️  Could not process book row ${i}: ${err.message}`));
      }
    }
    
    return books;
  }

  async downloadBook(book) {
    try {
      const sanitizedTitle = this.sanitizeFilename(book.title);
      
      // Try direct download links first
      if (book.hasPdf && book.pdfButton) {
        console.log(chalk.cyan(`  📄 Downloading PDF: ${book.title}`));
        await this.downloadFormat(book.pdfButton, sanitizedTitle, 'pdf');
      }
      
      if (book.hasEpub && book.epubButton) {
        console.log(chalk.cyan(`  📱 Downloading EPUB: ${book.title}`));
        await this.downloadFormat(book.epubButton, sanitizedTitle, 'epub');
      }
      
      // If no direct links found, try dropdown buttons
      if (!book.hasPdf && !book.hasEpub && book.dropdownButtons.length > 0) {
        console.log(chalk.cyan(`  🔍 Checking dropdown options for: ${book.title}`));
        await this.exploreDropdownOptions(book, sanitizedTitle);
      }
      
    } catch (error) {
      console.error(chalk.red(`❌ Failed to download ${book.title}:`), error.message);
    }
  }

  async exploreDropdownOptions(book, sanitizedTitle) {
    try {
      for (const dropdown of book.dropdownButtons) {
        // Click dropdown to reveal options
        await dropdown.click();
        await this.page.waitForTimeout(2000);
        
        // Look for PDF/EPUB options in the dropdown
        const dropdownMenu = this.page.locator('.dropdown-menu:visible, .dropdown:visible');
        
        if (await dropdownMenu.count() > 0) {
          const pdfLink = dropdownMenu.locator('a:has-text("pdf"), a:has-text("PDF")').first();
          const epubLink = dropdownMenu.locator('a:has-text("epub"), a:has-text("EPUB")').first();
          
          if (await pdfLink.count() > 0) {
            console.log(chalk.cyan(`    📄 Found PDF in dropdown`));
            await this.downloadFormat(pdfLink, sanitizedTitle, 'pdf');
          }
          
          if (await epubLink.count() > 0) {
            console.log(chalk.cyan(`    📱 Found EPUB in dropdown`));
            await this.downloadFormat(epubLink, sanitizedTitle, 'epub');
          }
          
          // Close dropdown
          await this.page.click('body');
          await this.page.waitForTimeout(1000);
        }
      }
    } catch (error) {
      console.error(chalk.red(`    ❌ Error exploring dropdowns: ${error.message}`));
    }
  }

  async downloadFormatFromRow(book, format, row, excludeDropdownIndex = -1) {
    const bookTitle = book.title || `Book_${book.index || 'Unknown'}`;
    const sanitizedTitle = this.sanitizeFilename(bookTitle);
    
    try {
      console.log(chalk.blue(`🔍 Downloading ${format} for: ${bookTitle}`));
      
      // Find the download link in this row
      const formatUrl = format === 'PDF' ? book.pdfUrl : book.epubUrl;
      if (!formatUrl) {
        console.log(chalk.yellow(`⚠️  No ${format} URL found for ${bookTitle}`));
        return { success: false, dropdownIndex: -1 };
      }
      
      console.log(chalk.gray(`  🔗 Looking for link: ${formatUrl}`));
      if (excludeDropdownIndex >= 0) {
        console.log(chalk.gray(`  🚫 Excluding dropdown ${excludeDropdownIndex + 1} (already used for other format)`));
      }
      
      // Find the specific dropdown button that contains the format we want
      console.log(chalk.blue(`🔽 Looking for ${format} dropdown button in row...`));
      
      // Get all dropdown buttons in this row
      const allDropdownButtons = await row.locator('button.dropdown-toggle, .dropdown-toggle, button[data-toggle="dropdown"], .btn-group button').all();
      
      if (allDropdownButtons.length === 0) {
        console.log(chalk.yellow(`⚠️  Could not find any dropdown buttons for ${format}`));
        return { success: false, dropdownIndex: -1 };
      }
      
      console.log(chalk.gray(`  Found ${allDropdownButtons.length} dropdown buttons in row`));
      
      let correctDropdownButton = null;
      let correctDropdownIndex = -1;
      
      // Close any previously open dropdowns first
      await this.page.click('body');
      await this.page.waitForTimeout(300);
      
      // Try each dropdown button to find the one that contains our format
      for (let i = 0; i < allDropdownButtons.length; i++) {
        // Skip the dropdown that was already used for the other format
        if (i === excludeDropdownIndex) {
          console.log(chalk.gray(`  ⏭️  Skipping dropdown ${i + 1}/${allDropdownButtons.length} (already used)`));
          continue;
        }
        
        const dropdownButton = allDropdownButtons[i];
        
        // First check if this dropdown has the right text content (pdf/epub/kindle)
        const dropdownText = await dropdownButton.textContent();
        const expectedText = format.toLowerCase();
        
        console.log(chalk.gray(`  🔍 Testing dropdown ${i + 1}/${allDropdownButtons.length} (text: "${dropdownText?.trim()}") for ${format}...`));
        
        // If the dropdown text doesn't match the format, skip it
        if (dropdownText && !dropdownText.toLowerCase().includes(expectedText)) {
          console.log(chalk.gray(`  ❌ Dropdown ${i + 1} text "${dropdownText.trim()}" doesn't match ${format}, skipping`));
          continue;
        }
        
        // Close any open dropdowns first
        await this.page.click('body');
        await this.page.waitForTimeout(300);
        
        // Click to open this specific dropdown
        await dropdownButton.scrollIntoViewIfNeeded();
        await dropdownButton.click();
        await this.page.waitForTimeout(800);
        
        // Check if this dropdown contains our format link
        const formatLinkInDropdown = await this.page.locator(`a[href="${formatUrl}"]`).first();
        const linkExists = await formatLinkInDropdown.count() > 0;
        
        if (linkExists) {
          console.log(chalk.green(`  ✅ Found ${format} link in dropdown ${i + 1}/${allDropdownButtons.length} (text: "${dropdownText?.trim()}")`));
          correctDropdownButton = dropdownButton;
          correctDropdownIndex = i;
          break;
        } else {
          console.log(chalk.gray(`  ❌ Dropdown ${i + 1}/${allDropdownButtons.length} doesn't contain ${format} link`));
          
          // Debug: Show what links are in this dropdown
          const allLinksInDropdown = await this.page.locator('a[href*="download"]').all();
          console.log(chalk.gray(`    Found ${allLinksInDropdown.length} download links in this dropdown:`));
          for (let j = 0; j < Math.min(allLinksInDropdown.length, 3); j++) {
            const href = await allLinksInDropdown[j].getAttribute('href');
            console.log(chalk.gray(`      - ${href}`));
          }
        }
      }
      
      if (!correctDropdownButton) {
        console.log(chalk.yellow(`⚠️  Could not find dropdown containing ${format} link`));
        return { success: false, dropdownIndex: -1 };
      }
      
      console.log(chalk.blue(`🖱️  Using correct dropdown for ${format} downloads...`));
      
      // Now look for the download link in the opened dropdown
      const downloadLink = await this.page.locator(`a[href="${formatUrl}"]`).first();
      const linkCount = await downloadLink.count();
      
      if (linkCount === 0) {
        console.log(chalk.yellow(`⚠️  Could not find download link in dropdown for ${format}`));
        return { success: false, dropdownIndex: -1 };
      }
      
      console.log(chalk.blue(`🖱️  Clicking download link for ${format}`));
      
      // Set up download promise before clicking
      const downloadPromise = this.page.waitForEvent('download', { timeout: 45000 });
      
      // Ensure link is visible and ready for interaction
      try {
        await downloadLink.scrollIntoViewIfNeeded({ timeout: 3000 });
        await downloadLink.waitFor({ state: 'visible', timeout: 3000 });
      } catch (visibilityError) {
        console.log(chalk.yellow(`⚠️  Link not visible, trying alternative approach for ${format}`));
        
        // Close any open dropdowns first
        await this.page.click('body');
        await this.page.waitForTimeout(300);
        
        // Re-open the dropdown
        const newDropdownButton = await row.locator('button.dropdown-toggle, .dropdown-toggle, button[data-toggle="dropdown"], .btn-group button').first();
        if (await newDropdownButton.count() > 0) {
          await newDropdownButton.click();
          await this.page.waitForTimeout(800);
          
          // Try to find the link again
          const newDownloadLink = await this.page.locator(`a[href="${formatUrl}"]`).first();
          if (await newDownloadLink.count() > 0) {
            await newDownloadLink.scrollIntoViewIfNeeded({ timeout: 2000 });
            await newDownloadLink.waitFor({ state: 'visible', timeout: 2000 });
            // Update the downloadLink reference
            const downloadLink = newDownloadLink;
          } else {
            console.log(chalk.red(`❌ Could not find ${format} link after retry`));
            return false;
          }
        } else {
          console.log(chalk.red(`❌ Could not find dropdown button for retry`));
          return false;
        }
      }
      
      // Small delay to simulate human behavior
      await this.page.waitForTimeout(500);
      
      // Click the download link
      await downloadLink.click({ 
        force: true,
        delay: 100,
        button: 'left'
      });
      console.log(chalk.green(`  ✅ Download link clicked`));
      
      // Additional wait after click for EPUB downloads (they seem slower)
      if (format === 'EPUB') {
        await this.page.waitForTimeout(800);
      }
      
      // Wait a moment for any processing
      await this.page.waitForTimeout(1000);
      
      // Check current URL and page state
      const currentUrl = this.page.url();
      const pageTitle = await this.page.title();
      console.log(chalk.gray(`  🌐 Current URL after click: ${currentUrl}`));
      console.log(chalk.gray(`  📄 Page title after click: ${pageTitle}`));
      
      // Check for error messages or login requirements
      const errorMessages = await this.page.locator('.error, .alert-danger, [class*="error"], .login-required').count();
      if (errorMessages > 0) {
        console.log(chalk.red(`  ❌ Found ${errorMessages} error/login message(s) on page`));
        const errorText = await this.page.locator('.error, .alert-danger, [class*="error"], .login-required').first().textContent();
        console.log(chalk.red(`  Error/Login text: ${errorText}`));
      }
      
      // Wait for download
      console.log(chalk.blue(`  ⏳ Waiting for download to start (30s timeout)...`));
      
      try {
        const download = await downloadPromise;
        console.log(chalk.green(`  📥 Download started!`));
        
        const filename = `${sanitizedTitle}.${format.toLowerCase()}`;
        const filepath = path.join(this.downloadsDir, filename);
        
        await download.saveAs(filepath);
        console.log(chalk.green(`✅ Saved: ${filename}`));
        
        return true;
        
      } catch (downloadTimeout) {
        console.log(chalk.yellow(`  ⏰ Download timeout - trying alternative approach`));
        
        // Maybe the click opened a new tab or window
        const pages = await this.page.context().pages();
        console.log(chalk.gray(`  📑 Total pages/tabs: ${pages.length}`));
        
        if (pages.length > 1) {
          console.log(chalk.blue(`  🔄 Checking other tabs for downloads...`));
          for (let i = 1; i < pages.length; i++) {
            const otherPage = pages[i];
            const otherUrl = otherPage.url();
            console.log(chalk.gray(`    Tab ${i}: ${otherUrl}`));
            
            // Close extra tabs
            await otherPage.close();
          }
        }
        
        // Check if we need to handle a different flow
        const pageContent = await this.page.content();
        if (pageContent.includes('download') || pageContent.includes('Download')) {
          console.log(chalk.blue(`  🔍 Page contains download references, investigating...`));
          
          // Look for any new download buttons or links
          const newDownloadLinks = await this.page.locator('a[href*="download"], button:has-text("download"), .download').all();
          console.log(chalk.gray(`    Found ${newDownloadLinks.length} potential download elements`));
        }
        
        return false;
      }
      
      // Close any open dropdowns before finishing
      await this.page.click('body');
      await this.page.waitForTimeout(300);
      
      // Small delay before next action
      await this.page.waitForTimeout(800);
      
      return { success: true, dropdownIndex: correctDropdownIndex };
      
    } catch (error) {
      console.log(chalk.red(`❌ Failed to download ${format}: ${error.message}`));
      
      // Always close dropdowns on error to prevent interference with next format
      try {
        await this.page.click('body');
        await this.page.waitForTimeout(300);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      return { success: false, dropdownIndex: -1 };
    }
  }

  sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      return 'Unknown_Book';
    }
    return filename
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscores for better file names
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .trim()
      .substring(0, 150); // Reasonable length limit
  }
}

module.exports = new ManningDownloader();
