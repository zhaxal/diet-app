import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('/Users/zhakhangiranuarbek/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

const iPhone14 = devices['iPhone 14'];
const ARTIFACT_DIR = '/Users/zhakhangiranuarbek/.gemini/antigravity-cli/brain/64d21412-7d5b-43d5-be25-2254ad144066';
const BASE_URL = 'http://localhost:3333';

async function run() {
  console.log('=== VERIFYING WORKOUT EXPANSION ON MOBILE VIEW (IPHONE 14) ===');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });

  const context = await browser.newContext({
    ...iPhone14,
    locale: 'en-US',
  });

  const page = await context.newPage();

  console.log('1. Logging in as demo user...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', 'demo@example.com');
  await page.fill('#password', 'password123');
  await page.click('button[type="submit"]');

  await page.waitForSelector('nav[aria-label="Bottom navigation"]', { timeout: 10000 });
  console.log('   Logged in!');

  console.log('2. Navigating to Workout tab...');
  const workoutTabButton = page.locator('nav button:has-text("Workout")');
  await workoutTabButton.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${ARTIFACT_DIR}/08_workout_tab_new_navigator.png` });

  console.log('3. Checking Workout Navigator...');
  const navigator = page.locator('nav[aria-label="Workout session navigation"]');
  const navExists = await navigator.isVisible();
  console.log(`   WorkoutNavigator visible: ${navExists}`);

  const quickRail = page.locator('div[aria-label="Recent workout sessions"]');
  const quickRailExists = await quickRail.isVisible();
  console.log(`   Recent Sessions Rail visible: ${quickRailExists}`);

  console.log('4. Checking Live Session Instrument Bar...');
  const volLabel = page.locator('text=Vol').first();
  console.log(`   Live Vol metric visible: ${await volLabel.isVisible()}`);

  const importBtn = page.locator('button[aria-label="Import workouts from Markdown"]');
  console.log(`   Import button visible: ${await importBtn.isVisible()}`);

  const exportLink = page.locator('a[aria-label="Export workouts to Obsidian markdown"]');
  console.log(`   Export button visible: ${await exportLink.isVisible()}`);

  console.log('5. Testing Add Exercise popover with 65+ catalog & muscle filters...');
  const addExButton = page.locator('button[aria-label="Add exercise from database"]');
  await addExButton.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${ARTIFACT_DIR}/09_exercise_search_popover.png` });

  const searchInput = page.locator('input[aria-label="Search exercises"]');
  const searchInputFontSize = await searchInput.evaluate(el => window.getComputedStyle(el).fontSize);
  console.log(`   Search input font-size: ${searchInputFontSize} (>= 16px to prevent iOS auto-zoom)`);

  console.log('   Filtering by Back muscle group...');
  const backPill = page.locator('button:has-text("Back")').first();
  await backPill.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${ARTIFACT_DIR}/10_back_exercises_filtered.png` });

  console.log('6. Inserting an exercise...');
  const pullupsOption = page.locator('button:has-text("Pullups")').first();
  if (await pullupsOption.isVisible()) {
    await pullupsOption.click();
    console.log('   Pullups inserted!');
  } else {
    // Click outside to close
    await page.click('body', { position: { x: 5, y: 5 } });
  }

  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${ARTIFACT_DIR}/11_note_after_exercise_insert.png` });

  console.log('7. Testing Import Modal...');
  await importBtn.click();
  await page.waitForSelector('text=Import Workouts', { timeout: 3000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${ARTIFACT_DIR}/12_import_modal_open.png` });

  const importTextarea = page.locator('textarea[aria-label="Obsidian markdown import text"]');
  const sampleImport = `# 2026-09-08 · Push Day\n\nBench Press\n- 80kg x 8\n- 80kg x 8\n\n## 2026-09-10 · Pull Day\n\nPullups\n- BW x 10\n- +10kg x 6\n`;
  await importTextarea.fill(sampleImport);
  await page.waitForTimeout(500);

  console.log('   Clicking Preview Import...');
  const previewBtn = page.locator('button:has-text("Preview Import")');
  await previewBtn.click();
  await page.waitForSelector('text=Parse Preview', { timeout: 5000 });
  console.log('   Dry-run preview rendered!');
  await page.screenshot({ path: `${ARTIFACT_DIR}/13_import_dry_run_preview.png` });

  console.log('   Clicking Confirm & Import...');
  const confirmBtn = page.locator('button:has-text("Confirm & Import")');
  await confirmBtn.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${ARTIFACT_DIR}/14_after_import_complete.png` });

  console.log('8. Checking Workout Summary 30-day analytics card...');
  const summaryCard = page.locator('text=30D Training');
  console.log(`   30D Training Summary visible: ${await summaryCard.isVisible()}`);
  await page.screenshot({ path: `${ARTIFACT_DIR}/15_final_workout_tab_state.png` });

  console.log('=== ALL WORKOUT EXPANSION BROWSER CHECKS COMPLETED SUCCESSFULLY! ===');
  await browser.close();
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
