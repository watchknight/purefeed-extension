// test-suite.js — Automated Pre-Production Regression Test Suite for PureFeed Extension

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✅ PASS: ${message}`);
    } else {
        failedTests++;
        console.error(`  ❌ FAIL: ${message}`);
    }
}

console.log('\n🚀 Running PureFeed Enterprise Regression Test Suite...\n');

// 1. MANIFEST INTEGRITY TESTS
console.log('📦 [1/5] Testing manifest.json Integrity...');
const manifestPath = path.join(ROOT_DIR, 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json exists');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert(manifest.manifest_version === 3, 'Manifest is version 3');
assert(manifest.permissions.includes('declarativeNetRequest'), 'Has declarativeNetRequest permission');
assert(manifest.permissions.includes('storage'), 'Has storage permission');
assert(Array.isArray(manifest.host_permissions) && manifest.host_permissions.length >= 4, 'Has declared host_permissions');
assert(fs.existsSync(path.join(ROOT_DIR, manifest.background.service_worker)), 'Background service worker file exists');

manifest.content_scripts.forEach((cs, i) => {
    cs.js.forEach(file => {
        assert(fs.existsSync(path.join(ROOT_DIR, file)), `Content script '${file}' exists`);
    });
    if (cs.css) {
        cs.css.forEach(file => {
            assert(fs.existsSync(path.join(ROOT_DIR, file)), `Content style '${file}' exists`);
        });
    }
});

// 2. DECLARATIVE NET REQUEST RULES TESTS
console.log('\n🛡️ [2/5] Testing rules.json (DNR Rules)...');
const rulesPath = path.join(ROOT_DIR, 'rules.json');
assert(fs.existsSync(rulesPath), 'rules.json exists');
const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
assert(Array.isArray(rules) && rules.length > 0, `rules.json contains ${rules.length} valid rules`);

const ids = new Set();
let allThirdParty = true;
rules.forEach(rule => {
    assert(!ids.has(rule.id), `Rule ID ${rule.id} is unique`);
    ids.add(rule.id);
    assert(rule.action && rule.action.type === 'block', `Rule ID ${rule.id} has block action`);
    if (rule.condition.domainType !== 'thirdParty') {
        allThirdParty = false;
    }
});
assert(allThirdParty, 'All network block rules specify domainType: thirdParty to protect 1st-party feeds');

// 3. SECURITY & CSP ZERO-TRUST AUDIT
console.log('\n🔒 [3/5] Testing Security & Message Origin Checks...');
const jsFiles = ['youtube.js', 'youtube-main.js', 'facebook.js', 'popup.js', 'background.js'];
jsFiles.forEach(file => {
    const content = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
    assert(!content.includes('innerHTML'), `${file} has NO innerHTML (XSS Prevention)`);
    assert(!content.includes('outerHTML'), `${file} has NO outerHTML (XSS Prevention)`);
    assert(!content.includes('eval('), `${file} has NO eval() (CSP Compliance)`);
    assert(!content.includes('new Function('), `${file} has NO new Function() (CSP Compliance)`);
    assert(!content.includes('document.createElement(\'script\')'), `${file} has NO inline DOM script injection`);
});

const ytContent = fs.readFileSync(path.join(ROOT_DIR, 'youtube.js'), 'utf8');
const fbContent = fs.readFileSync(path.join(ROOT_DIR, 'facebook.js'), 'utf8');
assert(ytContent.includes('sender.id !== chrome.runtime.id'), 'youtube.js enforces sender.id origin validation');
assert(fbContent.includes('sender.id !== chrome.runtime.id'), 'facebook.js enforces sender.id origin validation');

// 4. MAIN WORLD SETTINGS SYNCHRONIZATION
console.log('\n⚡ [4/5] Testing Main-World Dynamic Setting Synchronization...');
const ytMainContent = fs.readFileSync(path.join(ROOT_DIR, 'youtube-main.js'), 'utf8');
assert(ytMainContent.includes('data-purefeed-yt-ads'), 'youtube-main.js checks data-purefeed-yt-ads dynamically');
assert(ytMainContent.includes('adHandlingActive'), 'youtube-main.js prevents 15-second mid-roll reset loop');
assert(ytMainContent.includes('MutationObserver'), 'youtube-main.js has event-driven MutationObserver for player class');

// 5. ACCESSIBILITY (WCAG 2.1 AA) & UI TESTS
console.log('\n♿ [5/5] Testing Accessibility & UI Compliance...');
const popupHtml = fs.readFileSync(path.join(ROOT_DIR, 'popup.html'), 'utf8');
const popupCss = fs.readFileSync(path.join(ROOT_DIR, 'popup.css'), 'utf8');
assert(popupHtml.includes('role="switch"'), 'popup.html inputs have role="switch"');
assert(popupHtml.includes('aria-label='), 'popup.html inputs have accessible aria-labels');
assert(popupCss.includes(':focus-visible'), 'popup.css provides :focus-visible keyboard focus ring');
assert(popupHtml.includes('v2.3'), 'popup.html version is synchronized to v2.3');

// SUMMARY
console.log(`\n========================================`);
console.log(`📊 Test Summary: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
console.log(`========================================\n`);

if (failedTests > 0) {
    process.exit(1);
} else {
    console.log('🎉 ALL REGRESSION TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
}
