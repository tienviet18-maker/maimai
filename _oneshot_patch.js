/**
 * MaiMai one-shot production patch — surgical edits only.
 * Run once: node _oneshot_patch.js
 */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'index.html');
let html = fs.readFileSync(file, 'utf8');

function replaceOnce(label, from, to) {
  if (!html.includes(from)) {
    throw new Error('PATCH FAIL (not found): ' + label);
  }
  const count = html.split(from).length - 1;
  if (count !== 1) {
    throw new Error(`PATCH FAIL (count=${count}): ` + label);
  }
  html = html.replace(from, to);
  console.log('OK:', label);
}

function replaceAllUnique(label, from, to) {
  if (!html.includes(from)) {
    throw new Error('PATCH FAIL (not found): ' + label);
  }
  html = html.split(from).join(to);
  console.log('OK:', label);
}

// ---------- 1) CSS additions ----------
replaceOnce('css',
`        #daily-note-input::placeholder {
            color: #fda4af; /* Màu hồng nhạt (tailwind rose-300) */
            opacity: 1;
            font-size: 11px;
            font-weight: 500;
        }
    </style>`,
`        #daily-note-input::placeholder {
            color: #fda4af;
            opacity: 1;
            font-size: 11px;
            font-weight: 500;
        }
        .cal-day-cell { position: relative; }
        .cal-memo-dot {
            position: absolute; bottom: 1px; right: 2px;
            width: 4px; height: 4px; border-radius: 9999px;
            background: #fb7185;
        }
        .fertility-card {
            background: #fff7fb;
            border: 1px solid #fecdd3;
            border-radius: 1rem;
            padding: 0.65rem 0.75rem;
        }
        .about-card {
            background: #fdf2f8;
            border: 1px solid #fbcfe8;
            border-radius: 1rem;
            padding: 0.85rem 1rem;
        }
    </style>`);

// ---------- 2) Onboarding: About + Contact (before save button) ----------
replaceOnce('onboarding-about',
`            <button onclick="saveOnboardingProfile()" class="w-full mt-4 bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 rounded-2xl shadow-md active:scale-95 transition text-sm" data-i18n="saveBtn">
                Lưu & Bắt đầu ✨
            </button>
        </div>
    </div>

    <!-- WATER MODAL -->`,
`            <div class="about-card mt-4 space-y-2">
                <p class="text-sm font-bold text-gray-800" id="about-app-name">MaiMai</p>
                <p class="text-[11px] text-gray-500" data-i18n="developedBy">Phát triển bởi ViMai</p>
                <p class="text-[10px] font-bold text-pink-500 uppercase tracking-wide" data-i18n="contactTitle">Liên hệ & góp ý</p>
                <button type="button" onclick="contactViMaiSupport()" class="w-full py-2.5 bg-white border border-pink-200 text-pink-600 font-bold rounded-xl text-xs active:scale-95 transition" data-i18n="contactBtn">
                    Liên hệ ViMai
                </button>
            </div>

            <button onclick="saveOnboardingProfile()" class="w-full mt-4 bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 rounded-2xl shadow-md active:scale-95 transition text-sm" data-i18n="saveBtn">
                Lưu & Bắt đầu ✨
            </button>
        </div>
    </div>

    <!-- WATER MODAL -->`);

// ---------- 3) Day detail: fertility + memo polish ----------
replaceOnce('day-detail-fertility-memo',
`                    <div id="day-detail-panel" class="hidden mt-4 pt-4 border-t border-rose-200/60 relative z-10 space-y-3">
                        <div class="flex justify-between items-center">
                            <p class="text-xs font-bold text-rose-800" id="selected-day-title">--</p>
                            <button onclick="togglePeriodForSelectedDay()" id="btn-period-toggle" class="text-[10px] font-bold px-3 py-1 bg-white border border-rose-200 rounded-full text-rose-500 shadow-xs"></button>
                        </div>
                        <div id="symptoms-box" class="hidden space-y-1.5">
                            <p class="text-[10px] font-bold text-rose-600" data-i18n="symptomTitle">Triệu chứng cơ thể:</p>
                            <div class="flex flex-wrap gap-1.5">
                                <button onclick="toggleSymptom('Đau bụng')" id="sym-1" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Đau bụng 🥺</button>
                                <button onclick="toggleSymptom('Mỏi lưng')" id="sym-2" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Mỏi lưng 🛋️</button>
                                <button onclick="toggleSymptom('Cáu gắt')" id="sym-3" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Cáu gắt 😤</button>
                                <button onclick="toggleSymptom('Thèm ngọt')" id="sym-4" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Thèm ngọt 🍰</button>
                            </div>
                        </div>
                        
                        <!-- CHÈN THÊM PLACEHOLDER THÔNG QUA JAVASCRIPT CHUẨN UX -->
                        <textarea id="daily-note-input" class="w-full bg-white border border-rose-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-rose-400" rows="3"></textarea>
                        
                        <button onclick="saveDailyNote()" class="w-full bg-rose-400 hover:bg-rose-500 text-white text-xs font-bold py-2 rounded-xl shadow-xs active:scale-95 transition" data-i18n="saveNoteBtn">
                            Lưu nhật ký
                        </button>
                    </div>`,
`                    <div id="day-detail-panel" class="hidden mt-4 pt-4 border-t border-rose-200/60 relative z-10 space-y-3">
                        <div class="flex justify-between items-center">
                            <p class="text-xs font-bold text-rose-800" id="selected-day-title">--</p>
                            <button onclick="togglePeriodForSelectedDay()" id="btn-period-toggle" class="text-[10px] font-bold px-3 py-1 bg-white border border-rose-200 rounded-full text-rose-500 shadow-xs"></button>
                        </div>

                        <div id="fertility-panel" class="fertility-card space-y-1.5">
                            <p class="text-[10px] font-bold text-rose-500" data-i18n="fertilityTitle">💕 Khả năng thụ thai dự kiến</p>
                            <p id="fertility-level-text" class="text-[11px] font-semibold text-gray-700">—</p>
                            <p id="fertility-confidence-text" class="text-[10px] text-gray-400"></p>
                            <p id="fertility-disclaimer" class="text-[9px] text-gray-400 leading-relaxed" data-i18n="fertilityDisclaimer">MaiMai chỉ đưa ra ước tính dựa trên dữ liệu chu kỳ. Chu kỳ và thời điểm rụng trứng có thể thay đổi. Không sử dụng dự đoán này như một biện pháp tránh thai duy nhất.</p>
                        </div>

                        <div id="symptoms-box" class="hidden space-y-1.5">
                            <p class="text-[10px] font-bold text-rose-600" data-i18n="symptomTitle">Triệu chứng cơ thể:</p>
                            <div class="flex flex-wrap gap-1.5">
                                <button onclick="toggleSymptom('Đau bụng')" id="sym-1" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Đau bụng 🥺</button>
                                <button onclick="toggleSymptom('Mỏi lưng')" id="sym-2" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Mỏi lưng 🛋️</button>
                                <button onclick="toggleSymptom('Cáu gắt')" id="sym-3" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Cáu gắt 😤</button>
                                <button onclick="toggleSymptom('Thèm ngọt')" id="sym-4" class="px-2.5 py-1 bg-white text-rose-500 rounded-lg text-[10px] font-bold border border-rose-200">Thèm ngọt 🍰</button>
                            </div>
                        </div>

                        <div class="space-y-1.5">
                            <p class="text-[10px] font-bold text-rose-500" data-i18n="memoTitle">Memo nhỏ</p>
                            <textarea id="daily-note-input" class="w-full bg-white border border-rose-100 rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-rose-400 leading-relaxed" rows="3" placeholder="Bạn muốn lưu lại cảm xúc hay sự kiện gì hôm nay? 💗"></textarea>
                        </div>
                        
                        <button onclick="saveDailyNote()" class="w-full bg-rose-400 hover:bg-rose-500 text-white text-xs font-bold py-2 rounded-xl shadow-xs active:scale-95 transition" data-i18n="saveNoteBtn">
                            Lưu nhật ký
                        </button>
                    </div>`);

// ---------- 4) Coach: developed by ViMai ----------
replaceOnce('coach-brand',
`                    <div class="mt-4 pt-3 border-t border-gray-200/60 text-right">
                        <p class="text-xs font-bold text-gray-700" id="author-brand-title">MaiMai</p>
                        <p class="text-[10px] text-gray-400 italic mt-0.5" id="author-tagline-text">Made with ❤️</p>
                    </div>
                </div>
            </div>`,
`                    <div class="mt-4 pt-3 border-t border-gray-200/60 text-right">
                        <p class="text-xs font-bold text-gray-700" id="author-brand-title">MaiMai</p>
                        <p class="text-[10px] text-gray-400 italic mt-0.5" id="author-tagline-text">Made with ❤️</p>
                        <p class="text-[10px] text-gray-400 mt-1" data-i18n="developedBy">Phát triển bởi ViMai</p>
                    </div>
                </div>
            </div>`);

// ---------- 5) APP_CONFIG ----------
replaceOnce('app-config',
`        const APP_CONFIG = {
            appName: "MaiMai",
            taglines: { vi: "Một sản phẩm nhỏ được tạo nên bằng yêu thương ❤️", ja: "愛を込めて作った小さなアプリです ❤️", en: "A little app made with love ❤️" }
        };`,
`        const APP_CONFIG = {
            appName: "MaiMai",
            developerName: "ViMai",
            supportEmail: "vimai.support@gmail.com",
            taglines: { vi: "Một sản phẩm nhỏ được tạo nên bằng yêu thương ❤️", ja: "愛を込めて作った小さなアプリです ❤️", en: "A little app made with love ❤️" }
        };`);

// ---------- 6) I18N — append new keys before closing of each locale ----------
replaceOnce('i18n-vi',
`                memoPlaceholder: "💗 {name}, hôm nay bạn muốn lưu lại cảm xúc hay sự kiện gì không?"
            },
            ja: {`,
`                memoPlaceholder: "Bạn muốn lưu lại cảm xúc hay sự kiện gì hôm nay? 💗",
                memoTitle: "Memo nhỏ", saveNoteBtn: "Lưu nhật ký", sleepStatus: "Đêm qua",
                personaSweetName: "🌸 Ấm Áp", personaExpertName: "🌿 Chuyên gia Dinh Dưỡng", personaBuddyName: "✨ Bạn thân Năng Động",
                fertilityTitle: "💕 Khả năng thụ thai dự kiến",
                fertilityLow: "🟢 Khả năng thụ thai dự kiến thấp",
                fertilityMedium: "🟡 Có thể có khả năng thụ thai",
                fertilityHigh: "🔴 Khả năng thụ thai dự kiến cao",
                fertilityInsufficient: "Chưa đủ dữ liệu để dự đoán.",
                fertilityConfidenceLabel: "Độ tin cậy",
                fertilityConfLow: "Thấp", fertilityConfMid: "Trung bình", fertilityConfHigh: "Khá",
                fertilityDisclaimer: "MaiMai chỉ đưa ra ước tính dựa trên dữ liệu chu kỳ. Chu kỳ và thời điểm rụng trứng có thể thay đổi. Không sử dụng dự đoán này như một biện pháp tránh thai duy nhất.",
                developedBy: "Phát triển bởi ViMai",
                contactTitle: "Liên hệ & góp ý",
                contactBtn: "Liên hệ ViMai",
                contactSubject: "[MaiMai] Phản hồi từ người dùng",
                contactNoClient: "Không mở được ứng dụng email. Vui lòng gửi tới: "
            },
            ja: {`);

replaceOnce('i18n-ja',
`                memoPlaceholder: "💗 {name}さん、今日はどんな気持ちや出来事を残しておきますか？"
            },
            en: {`,
`                memoPlaceholder: "今日の気持ちや出来事を残しますか？ 💗",
                memoTitle: "小さなメモ", saveNoteBtn: "メモを保存", sleepStatus: "昨夜",
                personaSweetName: "🌸 やさしい", personaExpertName: "🌿 栄養の専門家", personaBuddyName: "✨ 元気な親友",
                fertilityTitle: "💕 妊娠可能性の予測",
                fertilityLow: "🟢 妊娠可能性は低めの予測",
                fertilityMedium: "🟡 妊娠の可能性がある予測",
                fertilityHigh: "🔴 妊娠可能性が高い予測",
                fertilityInsufficient: "予測に必要なデータが不足しています。",
                fertilityConfidenceLabel: "信頼度",
                fertilityConfLow: "低", fertilityConfMid: "中", fertilityConfHigh: "やや高い",
                fertilityDisclaimer: "MaiMaiは月経周期のデータに基づく予測を表示します。周期や排卵時期は変化する可能性があります。避妊方法として単独で使用しないでください。",
                developedBy: "ViMai が開発",
                contactTitle: "お問い合わせ・ご意見",
                contactBtn: "ViMai に連絡",
                contactSubject: "[MaiMai] Feedback from user",
                contactNoClient: "メールアプリを開けませんでした。次の宛先へ送ってください: "
            },
            en: {`);

replaceOnce('i18n-en',
`                memoPlaceholder: "💗 {name}, would you like to save a feeling or event from today?"
            }
        };`,
`                memoPlaceholder: "Want to save a feeling or event from today? 💗",
                memoTitle: "Little memo", saveNoteBtn: "Save note", sleepStatus: "Last night",
                personaSweetName: "🌸 Warm & Sweet", personaExpertName: "🌿 Nutrition Expert", personaBuddyName: "✨ Energetic Buddy",
                fertilityTitle: "💕 Estimated fertility",
                fertilityLow: "🟢 Estimated fertility: low",
                fertilityMedium: "🟡 Possible fertile window",
                fertilityHigh: "🔴 Estimated fertility: high",
                fertilityInsufficient: "Not enough data to estimate.",
                fertilityConfidenceLabel: "Confidence",
                fertilityConfLow: "Low", fertilityConfMid: "Medium", fertilityConfHigh: "Fair",
                fertilityDisclaimer: "MaiMai provides estimates based on cycle data. Cycle length and ovulation timing can vary. Do not use this estimate as your sole method of contraception.",
                developedBy: "Developed by ViMai",
                contactTitle: "Contact & feedback",
                contactBtn: "Contact ViMai",
                contactSubject: "[MaiMai] Feedback from user",
                contactNoClient: "Could not open an email app. Please write to: "
            }
        };`);

// ---------- 7) Insert missing core + fertility module after createMyFood block ----------
replaceOnce('insert-missing-funcs',
`        function deleteDailyFoodLog(logId, dateStr) { 
            const daily = getDailyRecord(dateStr); 
            if(daily && daily.foodLogs) {
                daily.foodLogs = daily.foodLogs.filter(l => l.id !== logId); 
                saveState(); 
            }
        }

        function renderFavorites() {`,
`        function deleteDailyFoodLog(logId, dateStr) { 
            const daily = getDailyRecord(dateStr); 
            if(daily && daily.foodLogs) {
                daily.foodLogs = daily.foodLogs.filter(l => l.id !== logId); 
                saveState(); 
            }
        }

        function selectPersona(persona) {
            tempSelectedPersona = persona || 'sweet';
            ['sweet', 'expert', 'buddy'].forEach(p => {
                const el = document.getElementById('persona-' + p);
                if (!el) return;
                if (p === tempSelectedPersona) {
                    el.classList.add('selected');
                    el.classList.remove('border-gray-100');
                    el.classList.add('border-pink-400');
                } else {
                    el.classList.remove('selected');
                    el.classList.remove('border-pink-400');
                    el.classList.add('border-gray-100');
                }
            });
        }

        function addFoodToDailyLog(food, grams, meal, dateStr) {
            if (!food) return null;
            const safeGrams = Math.max(0, Number(grams) || 0);
            const nutritionSnapshot = calculateNutrition(food.nutritionPer100g || {}, safeGrams);
            const displayName = food.nameVi || food.name || food.nameEn || food.nameJa || 'Food';
            const log = {
                id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('log_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
                foodId: food.id,
                type: food.type || 'master',
                nameVi: displayName,
                name: displayName,
                meal: meal || 'Trưa',
                grams: safeGrams,
                nutritionSnapshot,
                createdAt: new Date().toISOString()
            };
            const daily = getDailyRecord(dateStr);
            if (!daily.foodLogs) daily.foodLogs = [];
            daily.foodLogs.push(log);
            saveState();
            return log;
        }

        function renderMyFoodsList() {
            const container = document.getElementById('my-foods-container');
            if (!container) return;
            const foods = appData.myFoods || [];
            if (foods.length === 0) {
                container.innerHTML = '<p class="text-xs text-gray-400 text-center py-6">' + escapeHtml(I18N[currentLang].msgEmptyMyFoods) + '</p>';
                return;
            }
            container.innerHTML = foods.map(f => {
                const kcal = f.nutritionPer100g?.energyKcal ?? '--';
                return '<div class="bg-white p-3 rounded-2xl border border-pink-100 flex justify-between items-center shadow-sm">' +
                    '<div><p class="font-bold text-xs text-gray-800">🥗 ' + escapeHtml(f.name) + '</p>' +
                    '<p class="text-[10px] text-gray-400 mt-0.5">' + kcal + ' kcal / 100g · ' + (f.defaultGrams || 100) + 'g</p></div>' +
                    '<button onclick="selectFoodItem(\\'' + f.id + '\\', \\'user\\'); switchSubDietTab(\\'search\\');" class="px-3 py-1.5 bg-pink-500 text-white text-[10px] font-bold rounded-xl">+</button></div>';
            }).join('');
        }

        function openEditGram(logId) {
            const dateStr = getLocalDateStr(dietViewDate);
            const log = (getDailyRecord(dateStr).foodLogs || []).find(l => l.id === logId);
            if (!log) return;
            document.getElementById('edit-log-id').value = logId;
            document.getElementById('edit-log-gram').value = log.grams;
            document.getElementById('edit-gram-modal').classList.remove('hidden');
        }

        function closeEditGramModal() {
            document.getElementById('edit-gram-modal').classList.add('hidden');
        }

        function submitEditGram() {
            const logId = document.getElementById('edit-log-id').value;
            const grams = parseFloat(document.getElementById('edit-log-gram').value);
            if (isNaN(grams) || grams <= 0) { alert(I18N[currentLang].msgInvalidGram); return; }
            const dateStr = getLocalDateStr(dietViewDate);
            const daily = getDailyRecord(dateStr);
            const log = (daily.foodLogs || []).find(l => l.id === logId);
            if (!log) { closeEditGramModal(); return; }
            let per100 = null;
            if (log.foodId) {
                const master = FOOD_MASTER.find(f => f.id === log.foodId);
                const mine = (appData.myFoods || []).find(f => f.id === log.foodId);
                per100 = (master || mine)?.nutritionPer100g || null;
            }
            if (!per100 && log.nutritionSnapshot && log.grams) {
                const factor = 100 / log.grams;
                per100 = {
                    energyKcal: (log.nutritionSnapshot.energyKcal || 0) * factor,
                    protein: log.nutritionSnapshot.protein != null ? log.nutritionSnapshot.protein * factor : null,
                    fat: log.nutritionSnapshot.fat != null ? log.nutritionSnapshot.fat * factor : null,
                    carbohydrate: log.nutritionSnapshot.carbohydrate != null ? log.nutritionSnapshot.carbohydrate * factor : null,
                    fiber: log.nutritionSnapshot.fiber != null ? log.nutritionSnapshot.fiber * factor : null,
                    sodium: log.nutritionSnapshot.sodium != null ? log.nutritionSnapshot.sodium * factor : null
                };
            }
            log.grams = grams;
            if (per100) log.nutritionSnapshot = calculateNutrition(per100, grams);
            saveState();
            closeEditGramModal();
            renderDietView();
            if (dateStr === TODAY_STR) renderHealthAndHome();
        }

        function deleteFoodLogItem(logId) {
            const dateStr = getLocalDateStr(dietViewDate);
            deleteDailyFoodLog(logId, dateStr);
            renderDietView();
            if (dateStr === TODAY_STR) renderHealthAndHome();
        }

        function contactViMaiSupport() {
            const email = APP_CONFIG.supportEmail;
            const subject = encodeURIComponent((I18N[currentLang] && I18N[currentLang].contactSubject) || '[MaiMai] Phản hồi từ người dùng');
            const mailto = 'mailto:' + email + '?subject=' + subject;
            try {
                const a = document.createElement('a');
                a.href = mailto;
                a.rel = 'noopener';
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } catch (e) {
                try { window.location.href = mailto; } catch (e2) {
                    alert(((I18N[currentLang] && I18N[currentLang].contactNoClient) || '') + email);
                }
            }
        }

        // ---- Cycle stats + fertility (calendar method; luteal ~14d is standard medical approx) ----
        function parseDateOnly(dateStr) {
            const p = (dateStr || '').split('-').map(Number);
            if (p.length !== 3 || !p[0]) return null;
            return new Date(p[0], p[1] - 1, p[2]);
        }

        function daysBetweenDates(aStr, bStr) {
            const a = parseDateOnly(aStr); const b = parseDateOnly(bStr);
            if (!a || !b) return null;
            return Math.round((b - a) / 86400000);
        }

        function getPeriodStartDates() {
            const periodDates = Object.keys(appData.dailyRecords || {})
                .filter(d => appData.dailyRecords[d] && appData.dailyRecords[d].period)
                .sort();
            if (periodDates.length === 0) return [];
            const starts = [];
            for (let i = 0; i < periodDates.length; i++) {
                if (i === 0) { starts.push(periodDates[i]); continue; }
                const gap = daysBetweenDates(periodDates[i - 1], periodDates[i]);
                if (gap == null || gap > 1) starts.push(periodDates[i]);
            }
            return starts;
        }

        function getCycleStats() {
            const starts = getPeriodStartDates();
            if (starts.length < 2) {
                return { ready: false, starts, lengths: [], avgCycle: null, irregular: false, confidence: null };
            }
            const lengths = [];
            for (let i = 1; i < starts.length; i++) {
                const len = daysBetweenDates(starts[i - 1], starts[i]);
                if (len != null && len >= 15 && len <= 45) lengths.push(len);
            }
            if (lengths.length === 0) {
                return { ready: false, starts, lengths: [], avgCycle: null, irregular: false, confidence: null };
            }
            const avgCycle = lengths.reduce((s, n) => s + n, 0) / lengths.length;
            const minL = Math.min(...lengths);
            const maxL = Math.max(...lengths);
            const variance = lengths.reduce((s, n) => s + Math.pow(n - avgCycle, 2), 0) / lengths.length;
            const std = Math.sqrt(variance);
            const irregular = std > 7 || (maxL - minL) > 10;
            let confidence = 'low';
            if (lengths.length >= 3 && !irregular && std <= 3) confidence = 'high';
            else if (lengths.length >= 2 && !irregular) confidence = 'mid';
            else if (lengths.length >= 2 && irregular) confidence = 'low';
            else confidence = 'low';
            // Extremely irregular with thin history → not reliable enough
            if (irregular && lengths.length < 2) {
                return { ready: false, starts, lengths, avgCycle, irregular, confidence: null };
            }
            if (std > 12) {
                return { ready: false, starts, lengths, avgCycle, irregular: true, confidence: null };
            }
            return { ready: true, starts, lengths, avgCycle: Math.round(avgCycle * 10) / 10, irregular, confidence, std, minL, maxL };
        }

        function getFertilityForDate(dateStr) {
            const t = I18N[currentLang] || I18N.vi;
            const stats = getCycleStats();
            if (!stats.ready) {
                return { ready: false, level: null, confidence: null, levelText: t.fertilityInsufficient, confidenceText: '', disclaimer: t.fertilityDisclaimer };
            }
            const lastStart = stats.starts[stats.starts.length - 1];
            const avg = stats.avgCycle;
            // Standard calendar estimate: ovulation ≈ next menses − 14 (typical luteal length)
            const lastStartDate = parseDateOnly(lastStart);
            const targetDate = parseDateOnly(dateStr);
            if (!lastStartDate || !targetDate) {
                return { ready: false, level: null, confidence: null, levelText: t.fertilityInsufficient, confidenceText: '', disclaimer: t.fertilityDisclaimer };
            }
            // Find which cycle window this date falls into (past or projected)
            let cycleStart = lastStartDate;
            // If date is before last start, walk backward using avg cycle
            while (targetDate < cycleStart) {
                cycleStart = new Date(cycleStart.getTime() - Math.round(avg) * 86400000);
            }
            // If date is beyond this cycle, walk forward
            let nextStart = new Date(cycleStart.getTime() + Math.round(avg) * 86400000);
            while (targetDate >= nextStart) {
                cycleStart = nextStart;
                nextStart = new Date(cycleStart.getTime() + Math.round(avg) * 86400000);
            }
            const ovulation = new Date(nextStart.getTime() - 14 * 86400000);
            const dayOffset = Math.round((targetDate - ovulation) / 86400000);
            let level = 'low';
            if (dayOffset >= -1 && dayOffset <= 1) level = 'high';
            else if (dayOffset >= -5 && dayOffset <= -2) level = 'medium';
            else level = 'low';

            const confKey = stats.confidence === 'high' ? 'fertilityConfHigh' : stats.confidence === 'mid' ? 'fertilityConfMid' : 'fertilityConfLow';
            const levelText = level === 'high' ? t.fertilityHigh : level === 'medium' ? t.fertilityMedium : t.fertilityLow;
            // Irregular → never show "high confidence"
            let confLabel = t[confKey];
            if (stats.irregular && stats.confidence !== 'low') confLabel = t.fertilityConfLow;

            return {
                ready: true,
                level,
                confidence: stats.irregular ? 'low' : stats.confidence,
                levelText,
                confidenceText: t.fertilityConfidenceLabel + ': ' + confLabel,
                disclaimer: t.fertilityDisclaimer,
                avgCycle: stats.avgCycle,
                irregular: stats.irregular
            };
        }

        function renderFertilityPanel(dateStr) {
            const levelEl = document.getElementById('fertility-level-text');
            const confEl = document.getElementById('fertility-confidence-text');
            const discEl = document.getElementById('fertility-disclaimer');
            if (!levelEl) return;
            const info = getFertilityForDate(dateStr);
            levelEl.innerText = info.levelText;
            if (confEl) confEl.innerText = info.confidenceText || '';
            if (discEl) discEl.innerText = info.disclaimer || (I18N[currentLang].fertilityDisclaimer);
            if (info.level === 'high') levelEl.className = 'text-[11px] font-semibold text-rose-600';
            else if (info.level === 'medium') levelEl.className = 'text-[11px] font-semibold text-amber-600';
            else if (info.level === 'low') levelEl.className = 'text-[11px] font-semibold text-emerald-600';
            else levelEl.className = 'text-[11px] font-semibold text-gray-500';
        }

        function renderFavorites() {`);

// ---------- 8) Update getPredictedPeriodDates to use real avg cycle ----------
replaceOnce('predicted-period',
`        function getPredictedPeriodDates() {
            const periodDates = Object.keys(appData.dailyRecords).filter(d => appData.dailyRecords[d].period).sort();
            if (periodDates.length === 0) return [];
            const lastPeriodDate = new Date(periodDates[periodDates.length - 1]);
            const predictedDates = [];
            for (let cycle = 1; cycle <= 3; cycle++) {
                const nextStart = new Date(lastPeriodDate); nextStart.setDate(nextStart.getDate() + (28 * cycle));
                for (let day = 0; day < 5; day++) {
                    const pDay = new Date(nextStart); pDay.setDate(pDay.getDate() + day);
                    predictedDates.push(getLocalDateStr(pDay));
                }
            }
            return predictedDates;
        }`,
`        function getPredictedPeriodDates() {
            const starts = getPeriodStartDates();
            if (starts.length === 0) return [];
            const stats = getCycleStats();
            // Only predict when we have a measured average; otherwise do not invent a fixed 28-day cycle
            if (!stats.ready || !stats.avgCycle) return [];
            const lastStart = parseDateOnly(starts[starts.length - 1]);
            if (!lastStart) return [];
            const cycleLen = Math.round(stats.avgCycle);
            const predictedDates = [];
            for (let cycle = 1; cycle <= 3; cycle++) {
                const nextStart = new Date(lastStart); nextStart.setDate(nextStart.getDate() + (cycleLen * cycle));
                for (let day = 0; day < 5; day++) {
                    const pDay = new Date(nextStart); pDay.setDate(pDay.getDate() + day);
                    predictedDates.push(getLocalDateStr(pDay));
                }
            }
            return predictedDates;
        }`);

// ---------- 9) renderCalendar: memo dots ----------
replaceOnce('calendar-cell',
`            for (let i = 1; i <= totalDays; i++) {
                const dateStr = \`\${calYear}-\${String(calMonth + 1).padStart(2, '0')}-\${String(i).padStart(2, '0')}\`;
                const isPeriod = appData.dailyRecords[dateStr]?.period;
                let classes = "w-7 h-7 mx-auto flex items-center justify-center rounded-full text-xs cursor-pointer transition ";
                if (isPeriod) classes += "cal-period-active "; else if (predictedDates.includes(dateStr) && !isPeriod) classes += "cal-period-predict "; else if (dateStr === TODAY_STR) classes += "cal-today bg-white "; else classes += "text-gray-700 bg-white hover:bg-rose-50 shadow-2xs ";
                if (dateStr === selectedCalendarDateStr && !isPeriod) classes += " ring-2 ring-rose-400 ";
                grid.innerHTML += \`<div class="\${classes}" onclick="openDayDetail('\${dateStr}')">\${i}</div>\`;
            }`,
`            for (let i = 1; i <= totalDays; i++) {
                const dateStr = \`\${calYear}-\${String(calMonth + 1).padStart(2, '0')}-\${String(i).padStart(2, '0')}\`;
                const isPeriod = appData.dailyRecords[dateStr]?.period;
                const hasMemo = !!(appData.dailyRecords[dateStr]?.note && String(appData.dailyRecords[dateStr].note).trim());
                let classes = "cal-day-cell w-7 h-7 mx-auto flex items-center justify-center rounded-full text-xs cursor-pointer transition ";
                if (isPeriod) classes += "cal-period-active "; else if (predictedDates.includes(dateStr) && !isPeriod) classes += "cal-period-predict "; else if (dateStr === TODAY_STR) classes += "cal-today bg-white "; else classes += "text-gray-700 bg-white hover:bg-rose-50 shadow-2xs ";
                if (dateStr === selectedCalendarDateStr && !isPeriod) classes += " ring-2 ring-rose-400 ";
                const memoDot = hasMemo ? '<span class="cal-memo-dot"></span>' : '';
                grid.innerHTML += \`<div class="\${classes}" onclick="openDayDetail('\${dateStr}')">\${i}\${memoDot}</div>\`;
            }`);

// ---------- 10) openDayDetail: fertility + memo + symptoms visibility ----------
replaceOnce('open-day-detail',
`        function openDayDetail(dateStr) {
            selectedCalendarDateStr = dateStr; renderCalendar(); document.getElementById('day-detail-panel').classList.remove('hidden');
            const dArr = dateStr.split('-'); document.getElementById('selected-day-title').innerText = \`\${dArr[2]}/\${dArr[1]}/\${dArr[0]}\`;
            const dayData = getDailyRecord(dateStr);
            document.getElementById('btn-period-toggle').innerText = dayData.period ? (currentLang === 'ja' ? "生理日の記録を解除 🌸" : currentLang === 'en' ? "Unmark Period 🌸" : "Bỏ đánh dấu Ngày Dâu 🌸") : (currentLang === 'ja' ? "生理日として記録 🩸" : currentLang === 'en' ? "Log Period Day 🩸" : "Đánh dấu Ngày Dâu 🩸");
            
            // XỬ LÝ PLACEHOLDER CHO MEMO
            const uName = escapeHtml(appData.profile.userName || (currentLang === 'ja' ? 'あなた' : currentLang === 'en' ? 'friend' : 'bạn'));
            const phString = I18N[currentLang].memoPlaceholder || I18N.vi.memoPlaceholder;
            const noteInput = document.getElementById('daily-note-input');
            noteInput.placeholder = phString.replace('{name}', uName);
            noteInput.value = dayData.note || '';

            ['sym-1','sym-2','sym-3','sym-4'].forEach(id => { const btn = document.getElementById(id); const sym = btn.innerText.split(' ')[0]; if (dayData.symptoms && dayData.symptoms.includes(sym)) { btn.classList.add('bg-rose-500', 'text-white'); btn.classList.remove('bg-white', 'text-rose-500'); } else { btn.classList.remove('bg-rose-500', 'text-white'); btn.classList.add('bg-white', 'text-rose-500'); } });
        }`,
`        function openDayDetail(dateStr) {
            selectedCalendarDateStr = dateStr; renderCalendar(); document.getElementById('day-detail-panel').classList.remove('hidden');
            const dArr = dateStr.split('-'); document.getElementById('selected-day-title').innerText = \`\${dArr[2]}/\${dArr[1]}/\${dArr[0]}\`;
            const dayData = getDailyRecord(dateStr);
            document.getElementById('btn-period-toggle').innerText = dayData.period ? (currentLang === 'ja' ? "生理日の記録を解除 🌸" : currentLang === 'en' ? "Unmark Period 🌸" : "Bỏ đánh dấu Ngày Dâu 🌸") : (currentLang === 'ja' ? "生理日として記録 🩸" : currentLang === 'en' ? "Log Period Day 🩸" : "Đánh dấu Ngày Dâu 🩸");

            const noteInput = document.getElementById('daily-note-input');
            noteInput.placeholder = (I18N[currentLang].memoPlaceholder || I18N.vi.memoPlaceholder);
            noteInput.value = dayData.note || '';

            const symBox = document.getElementById('symptoms-box');
            if (symBox) {
                if (dayData.period) symBox.classList.remove('hidden');
                else symBox.classList.add('hidden');
            }

            ['sym-1','sym-2','sym-3','sym-4'].forEach(id => {
                const btn = document.getElementById(id);
                if (!btn) return;
                const sym = btn.innerText.split(' ')[0];
                if (dayData.symptoms && dayData.symptoms.includes(sym)) {
                    btn.classList.add('bg-rose-500', 'text-white');
                    btn.classList.remove('bg-white', 'text-rose-500');
                } else {
                    btn.classList.remove('bg-rose-500', 'text-white');
                    btn.classList.add('bg-white', 'text-rose-500');
                }
            });

            renderFertilityPanel(dateStr);
        }`);

// ---------- 11) saveDailyNote: re-render calendar for memo dots ----------
replaceOnce('save-daily-note',
`        function saveDailyNote() { getDailyRecord(selectedCalendarDateStr).note = document.getElementById('daily-note-input').value; saveState(); alert(I18N[currentLang].msgNoteSaved); }`,
`        function saveDailyNote() {
            const noteInput = document.getElementById('daily-note-input');
            getDailyRecord(selectedCalendarDateStr).note = noteInput ? noteInput.value : '';
            saveState();
            renderCalendar();
            openDayDetail(selectedCalendarDateStr);
            alert(I18N[currentLang].msgNoteSaved);
        }`);

// ---------- 12) setLanguage: brand about + fertility refresh ----------
replaceOnce('set-language',
`        function setLanguage(lang) {
            currentLang = lang; appData.profile.lang = lang; saveState();
            document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if (I18N[lang] && I18N[lang][key]) el.innerText = I18N[lang][key]; });
            ['vi', 'ja', 'en'].forEach(l => { const btn = document.getElementById(\`btn-lang-\${l}\`); if (btn) { if (l === lang) btn.classList.add('active'); else btn.classList.remove('active'); } });
            const headerSelect = document.getElementById('header-lang-select'); if (headerSelect) headerSelect.value = lang;
            document.getElementById('author-brand-title').innerText = APP_CONFIG.appName;
            document.getElementById('author-tagline-text').innerText = APP_CONFIG.taglines[lang] || APP_CONFIG.taglines.vi;
            renderHealthAndHome(); renderCalendar(); renderBMIAnalysis(); renderFavorites(); updateMultiPersonaCoach(true);
            
            // XỬ LÝ LẠI PLACEHOLDER NGAY LẬP TỨC NẾU MÀN HÌNH NHẬT KÝ NGÀY ĐANG MỞ
            if (!document.getElementById('day-detail-panel').classList.contains('hidden')) {
                openDayDetail(selectedCalendarDateStr);
            }
        }`,
`        function setLanguage(lang) {
            currentLang = lang; appData.profile.lang = lang; saveState();
            document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if (I18N[lang] && I18N[lang][key] != null) el.innerText = I18N[lang][key]; });
            ['vi', 'ja', 'en'].forEach(l => { const btn = document.getElementById(\`btn-lang-\${l}\`); if (btn) { if (l === lang) btn.classList.add('active'); else btn.classList.remove('active'); } });
            const headerSelect = document.getElementById('header-lang-select'); if (headerSelect) headerSelect.value = lang;
            const brandTitle = document.getElementById('author-brand-title');
            if (brandTitle) brandTitle.innerText = APP_CONFIG.appName;
            const tagline = document.getElementById('author-tagline-text');
            if (tagline) tagline.innerText = APP_CONFIG.taglines[lang] || APP_CONFIG.taglines.vi;
            const aboutName = document.getElementById('about-app-name');
            if (aboutName) aboutName.innerText = APP_CONFIG.appName;
            const noteInput = document.getElementById('daily-note-input');
            if (noteInput) noteInput.placeholder = (I18N[lang].memoPlaceholder || I18N.vi.memoPlaceholder);
            renderHealthAndHome(); renderCalendar(); renderBMIAnalysis(); renderFavorites(); updateMultiPersonaCoach(true);
            const dayPanel = document.getElementById('day-detail-panel');
            if (dayPanel && !dayPanel.classList.contains('hidden')) {
                openDayDetail(selectedCalendarDateStr);
            }
        }`);

// ---------- 13) selectFoodItem: fill ref nutrition + source ----------
replaceOnce('select-food-item',
`        function selectFoodItem(id, type) {
            const food = (type === 'user') ? appData.myFoods.find(f => f.id === id) : FOOD_MASTER.find(f => f.id === id); if (!food) return;
            currentSelectedFood = { item: food, type: type }; document.getElementById('search-results-box').classList.add('hidden');
            const name = currentLang === 'ja' ? (food.nameJa || food.name) : currentLang === 'en' ? (food.nameEn || food.name) : (food.nameVi || food.name);
            document.getElementById('food-search-input').value = name; document.getElementById('selected-food-calculator').classList.remove('hidden');
            document.getElementById('calc-food-name').innerText = name;
            
            const favBtn = document.getElementById('btn-calc-fav');
            if(favBtn) favBtn.innerText = (appData.favorites && appData.favorites.includes(food.id)) ? '❤️' : '🤍';

            const defGram = food.defaultGrams || 150;
            document.getElementById('calc-gram-input').value = defGram; onGramChange(defGram);
        }`,
`        function selectFoodItem(id, type) {
            const food = (type === 'user') ? (appData.myFoods || []).find(f => f.id === id) : FOOD_MASTER.find(f => f.id === id); if (!food) return;
            currentSelectedFood = { item: food, type: type }; document.getElementById('search-results-box').classList.add('hidden');
            const name = currentLang === 'ja' ? (food.nameJa || food.name) : currentLang === 'en' ? (food.nameEn || food.name) : (food.nameVi || food.name);
            document.getElementById('food-search-input').value = name; document.getElementById('selected-food-calculator').classList.remove('hidden');
            document.getElementById('calc-food-name').innerText = name;
            const srcEl = document.getElementById('calc-food-source');
            if (srcEl) srcEl.innerText = food.source || (type === 'user' ? 'user' : 'master');
            const n = food.nutritionPer100g || {};
            const setRef = (eid, val) => { const el = document.getElementById(eid); if (el) el.innerText = (val == null ? '--' : val); };
            setRef('ref-energy', n.energyKcal); setRef('ref-protein', n.protein); setRef('ref-fat', n.fat); setRef('ref-carb', n.carbohydrate); setRef('ref-sodium', n.sodium);
            
            const favBtn = document.getElementById('btn-calc-fav');
            if(favBtn) favBtn.innerText = (appData.favorites && appData.favorites.includes(food.id)) ? '❤️' : '🤍';

            const defGram = food.defaultGrams || 150;
            document.getElementById('calc-gram-input').value = defGram; onGramChange(defGram);
        }`);

// ---------- 14) meta title branding consistency ----------
replaceOnce('title',
`<title>Maimai: Calo & Bạn Đồng Hành 🌸</title>`,
`<title>MaiMai: Calo & Bạn Đồng Hành 🌸</title>`);

replaceOnce('apple-title',
`<meta name="apple-mobile-web-app-title" content="Maimai">`,
`<meta name="apple-mobile-web-app-title" content="MaiMai">`);

fs.writeFileSync(file, html);
console.log('\\nPatched OK. New length:', html.length);

// Quick static verification
const mustExist = [
  'function selectPersona', 'function addFoodToDailyLog', 'function renderMyFoodsList',
  'function openEditGram', 'function submitEditGram', 'function closeEditGramModal',
  'function deleteFoodLogItem', 'function contactViMaiSupport', 'function getFertilityForDate',
  'function getCycleStats', 'function renderFertilityPanel', 'developerName: "ViMai"',
  'supportEmail: "vimai.support@gmail.com"', 'fertility-panel', 'about-app-name'
];
for (const m of mustExist) {
  if (!html.includes(m)) console.error('MISSING AFTER PATCH:', m);
  else console.log('present:', m);
}
