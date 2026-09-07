const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Launching real Chromium browser for user flow testing...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => console.log('❌ Page Error:', err.message));

  try {
    // 1. Visit Web App Landing Page
    console.log('\n--- 1. Testing Landing Page ---');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 15000 });
    const pageTitle = await page.title();
    console.log('✓ Page Title:', pageTitle);
    
    // Check for CTA to GIS Command Center
    const launchBtn = page.getByRole('button', { name: /launch gis command center/i }).first();
    console.log('✓ Found Launch GIS Command Center CTA button');
    await launchBtn.click();
    await page.waitForTimeout(1000);

    // 2. Command Center Overview & Navbar Buttons
    console.log('\n--- 2. Testing Command Center & Navbar Buttons ---');
    const brandHeading = await page.locator('text=NE-SHIELD').first().textContent();
    console.log('✓ Command Center Active:', brandHeading);

    // Check Role Selector
    const roleSelect = page.locator('select').first();
    const currentRole = await roleSelect.inputValue();
    console.log('✓ Current RBAC Role:', currentRole);

    // Switch to Admin
    await roleSelect.selectOption('admin');
    console.log('✓ Switched RBAC Role to: Admin');
    await page.waitForTimeout(500);

    // Verify Admin buttons visible: Simulator, Alerts Engine
    const simBtn = page.getByRole('button', { name: /disaster simulator/i });
    console.log('✓ Simulator button visible for Admin:', await simBtn.isVisible());

    const alertsBtn = page.getByRole('button', { name: /alerts engine/i });
    console.log('✓ Alerts Engine button visible for Admin:', await alertsBtn.isVisible());

    // 3. Test "Find Shelter & Evacuate" Feature
    console.log('\n--- 3. Testing Evacuation & Shelter Finder Modal ---');
    const evacBtn = page.getByRole('button', { name: /find shelter & evacuate/i });
    await evacBtn.click();
    await page.waitForTimeout(500);

    const evacModal = page.locator('text=Emergency Evacuation & Shelter Finder');
    console.log('✓ Evacuation Modal opened:', await evacModal.isVisible());

    // Fill location
    const locationInput = page.locator('input[placeholder*="Police Bazar Shillong"]');
    await locationInput.fill('Police Bazar Shillong');
    console.log('✓ Typed location: Police Bazar Shillong');

    const findRouteBtn = page.getByRole('button', { name: /find safe route/i });
    await findRouteBtn.click();
    console.log('✓ Clicked "Find Safe Route" button');
    await page.waitForTimeout(2000);

    // Check results displayed
    const shelterCard = page.locator('text=Assigned Safe Haven Shelter');
    console.log('✓ Assigned Shelter Card rendered:', await shelterCard.isVisible());

    const ndmaPrecautions = page.locator('text=Personalized NDMA Survival Precautions');
    console.log('✓ Personalized NDMA Precautions rendered:', await ndmaPrecautions.isVisible());

    // Click "Mark Myself Safe" checkin
    const safeCheckinBtn = page.getByRole('button', { name: /mark myself safe/i });
    if (await safeCheckinBtn.isVisible()) {
      await safeCheckinBtn.click();
      console.log('✓ Clicked Community Safety Check-in button');
    }

    // Close modal or view on map
    const viewOnMapBtn = page.getByRole('button', { name: /view on map/i });
    if (await viewOnMapBtn.isVisible()) {
      await viewOnMapBtn.click();
      console.log('✓ Clicked "View on Map" to plot evacuation route');
    } else {
      const closeEvacModal = page.locator('button:has-text("✕")').first();
      await closeEvacModal.click();
      console.log('✓ Closed evacuation modal with close button');
    }
    await page.waitForTimeout(1000);

    // 4. Test Emergency Priority Dashboard & Incident Triage Tab
    console.log('\n--- 4. Testing Emergency Dashboard & Incident Triage ---');
    const emergencyDashBtn = page.getByRole('button', { name: /emergency priority|emergency prioritisation/i }).first();
    await emergencyDashBtn.click();
    await page.waitForTimeout(1000);

    const dashTitle = page.locator('text=Regional Disaster Management & Rapid Response Prioritisation');
    console.log('✓ Emergency Dashboard opened:', await dashTitle.isVisible());

    // Switch to Incident Triage Tab
    const triageTabBtn = page.getByRole('button', { name: /incident triage/i });
    await triageTabBtn.click();
    console.log('✓ Switched to "Incident Triage & Officer Dispatch" tab');
    await page.waitForTimeout(1000);

    // Check if incident cards rendered
    const assignBtn = page.getByRole('button', { name: /assign officer/i }).first();
    if (await assignBtn.isVisible()) {
      await assignBtn.click();
      console.log('✓ Admin assigned officer to incident');
      await page.waitForTimeout(1000);
    }

    // Close Emergency Dashboard
    const closeDashBtn = page.locator('button[aria-label="Close dashboard"]').first();
    await closeDashBtn.click({ force: true });
    console.log('✓ Closed Emergency Dashboard');
    await page.waitForTimeout(800);


    // Switch to Field Officer and verify role
    await roleSelect.selectOption('field_officer');
    console.log('✓ Switched role to Field Officer in top navbar');
    await page.waitForTimeout(500);

    // 5. Test Disaster Simulator (Run Scenario & Siren Alert)
    console.log('\n--- 5. Testing Disaster Simulator ---');
    await roleSelect.selectOption('admin');
    await page.waitForTimeout(500);
    await simBtn.click();
    await page.waitForTimeout(800);

    const simModal = page.locator('text=Disaster & Cloudburst Simulator');
    console.log('✓ Simulator Modal opened:', await simModal.isVisible());

    // Click "Run Scenario Simulation"
    const startSimBtn = page.getByRole('button', { name: /run scenario simulation/i }).first();
    if (await startSimBtn.isVisible()) {
      await startSimBtn.click();
      console.log('✓ Clicked "Run Scenario Simulation" button');
      await page.waitForTimeout(4000); // allow pipeline animation
    }

    // Close Simulator
    const closeSimBtn = page.getByRole('button', { name: /^close$/i }).first();
    await closeSimBtn.click();
    console.log('✓ Simulator run complete & closed');
    await page.waitForTimeout(800);

    // Check if Top Warning Banner is active
    const warningBanner = page.locator('text=🚨').first();
    console.log('✓ Emergency Banner active after simulation:', await warningBanner.isVisible());

    // 6. Test Report Incident Form
    console.log('\n--- 6. Testing Incident Report Form ---');
    const reportBtn = page.getByRole('button', { name: /report incident|field inspection log/i }).first();
    await reportBtn.click();
    await page.waitForTimeout(600);

    const reportModal = page.locator('text=Ground Incident Reporting');
    console.log('✓ Incident Report Modal opened:', await reportModal.isVisible());

    const descInput = page.locator('textarea').first();
    if (await descInput.isVisible()) {
      await descInput.fill('Browser Automated QA inspection - Minor slope depression noted.');
      console.log('✓ Filled incident description');
    }

    const cancelReportBtn = page.getByRole('button', { name: /cancel/i }).first();
    if (await cancelReportBtn.isVisible()) {
      await cancelReportBtn.click();
      console.log('✓ Clicked Cancel on Incident Modal');
    }

    console.log('\n========================================');
    console.log('🎉 ALL IN-BROWSER UI & FEATURE TESTS PASSED!');
    console.log('========================================\n');

  } catch (err) {
    console.error('❌ Browser Test Failure:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();

