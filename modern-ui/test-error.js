import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:5173');
  
  // Click on Decoder tab
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log("Clicking Decoder");
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const decoder = tabs.find(t => t.textContent.includes('Decoder'));
    if (decoder) decoder.click();
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await browser.close();
})();
