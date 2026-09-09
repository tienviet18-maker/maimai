/**
 * COPY-ONLY mobile bridge for www/index.html (never touches WellnessApp_Store).
 * Responsive insets + AdMob spacer driven by bannerAdSizeChanged (no device hard-codes).
 */
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'www', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

if (html.includes('bannerAdSizeChanged') && html.includes('--maimai-banner-h') && html.includes('maimai-capacitor')) {
  console.log('Bridge already complete — skip');
  process.exit(0);
}

if (!html.includes('admob.config.js')) {
  html = html.replace(
    '<script src="data/foods/foods_db.js"></script>',
    '<script src="data/foods/foods_db.js"></script>\n    <script src="admob.config.js"></script>'
  );
}

const cssPatch = `
        /* MAIMAI_MOBILE_BRIDGE: responsive system insets + AdMob spacer (COPY only)
           Native AdMob banner OVERLAYS the WebView — reserve only the reported ad height.
           Heights come from CSS variables (set by bridge on bannerAdSizeChanged).
           No device-model hard-coding; uses env(safe-area-inset-*) + measured banner. */
        html.maimai-capacitor {
            --maimai-inset-top: env(safe-area-inset-top, 0px);
            --maimai-inset-bottom: env(safe-area-inset-bottom, 0px);
            --maimai-banner-h: 0px;
            --maimai-chrome-bg: #fdf2f8;
        }
        body.maimai-capacitor {
            padding-top: var(--maimai-inset-top);
            padding-bottom: calc(var(--maimai-banner-h) + var(--maimai-inset-bottom));
            box-sizing: border-box;
            background-color: var(--maimai-chrome-bg);
        }
        body.maimai-capacitor .fixed.bottom-0 {
            bottom: calc(var(--maimai-banner-h) + var(--maimai-inset-bottom));
        }
        #maimai-ad-banner-slot {
            position: fixed;
            left: 0; right: 0; bottom: 0;
            height: calc(var(--maimai-banner-h) + var(--maimai-inset-bottom));
            z-index: 40;
            pointer-events: none;
            background: var(--maimai-chrome-bg);
        }
        body.maimai-capacitor.maimai-banner-ready #maimai-ad-banner-slot {
            background: transparent;
        }
`;

if (/MAIMAI_MOBILE_BRIDGE:/.test(html)) {
  html = html.replace(
    /\/\* MAIMAI_MOBILE_BRIDGE:[\s\S]*?body\.maimai-capacitor\.maimai-banner-ready #maimai-ad-banner-slot \{[\s\S]*?\}\n|\/\* MAIMAI_MOBILE_BRIDGE:[\s\S]*?#maimai-ad-banner-slot \{[\s\S]*?\}\n/,
    cssPatch.trimStart()
  );
} else {
  html = html.replace('</style>', cssPatch + '\n    </style>');
}

console.log('Note: full JS bridge is maintained in www/index.html; CSS patch applied if needed.');
fs.writeFileSync(htmlPath, html);
console.log('Patched COPY www/index.html mobile bridge CSS');
