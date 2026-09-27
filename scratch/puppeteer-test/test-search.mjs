import { createRequire } from 'module';
const require = createRequire(process.cwd() + '/package.json');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  page.on('response', async (res) => {
    if (res.url().includes('/admin/quotations') || res.url().includes('search')) {
       if (res.request().method() === 'POST') {
           try {
               const text = await res.text();
               console.log('POST RESPONSE to', res.url(), ':', text.substring(0, 1000));
           } catch (e) {}
       }
    }
  });

  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/login');
  
  await page.type('input[name="email"]', 'admin@ftc.com');
  await page.type('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  
  console.log('Navigating to quotations...');
  await page.goto('http://localhost:3000/admin/quotations', { waitUntil: 'networkidle0' });
  
  // Click "Create Quotation"
  const createBtn = await page.$x("//button[contains(., 'Create Quotation')]");
  if (createBtn.length > 0) {
      await createBtn[0].click();
      console.log('Clicked Create Quotation');
      await page.waitForTimeout(1000);
      
      console.log('Typing in dealer search...');
      const inputs = await page.$$('input[placeholder*="Search by company"]');
      if (inputs.length > 0) {
          await inputs[0].type('ab');
          await page.waitForTimeout(2000);
          
          const noResults = await page.$x("//div[contains(text(), 'No dealers found')]");
          console.log('No results text visible?', noResults.length > 0);
          
          const ul = await page.$('ul');
          console.log('UL element exists?', !!ul);
          if (ul) {
              const html = await page.evaluate(el => el.outerHTML, ul);
              console.log('UL HTML:', html);
          }
      } else {
          console.log('Dealer search input not found');
      }
  } else {
      console.log('Create Quotation button not found');
  }

  await browser.close();
})();
