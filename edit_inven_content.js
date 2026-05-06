(function() {
    'use strict';

    // v4.1 - Weapon Grade Selector Support
    const SHEET_ID = '1QO6g8ZKlHyV9VRu-Lii-njRamrUP1mTbrAYRGYEjIeA';
    const SHEET_NAME = 'rf';
    const WEAPON_SHEET_NAME = 'weapons'; // Sheet baru untuk weapon database
    const CACHE_DURATION = 5 * 60 * 1000;

    // Set to true during development to enable verbose logging
    const DEBUG = false;
    const log = (...args) => DEBUG && console.log(...args);
    const logError = (...args) => console.error(...args); // errors always shown

    // Global variables
    let itemDatabase = null;
    let weaponDatabase = null; // Database senjata dari sheet 'weapons'
    let lastCacheTime = 0;
    let lastWeaponCacheTime = 0;
    let currentPlayerRace = null;
    let currentPlayerNickname = null;
    let selectedWeaponInput = null; // Input field weapon yang sedang dipilih
    // Multi-level undo/redo replaces single lastChanges
    let currentScannedItems = [];
    let currentFixedItems = [];
    let isMinimized = false;
    let refreshIntervalId = null;
    let raceDetectIntervalId = null;
    let currentScanFilter = 'all'; // 'all' | 'mismatch' | 'ok'
    
    // Multi-level undo/redo system
    const MAX_HISTORY = 10;
    let undoStack = [];  // [{action, items, timestamp}, ...]
    let redoStack = [];  // same structure

    // Weapon classifications
    const STANDARD_WEAPON_TYPES = [
        'dk', 'sp', 'sw', 'st', 'bo', 'fi', 'kn',
        'lu', 'fl', 'ma', 'ax', 'fa'
    ];

    // Item categories based on race position
    const ITEM_CATEGORIES = {
        // Race at position 3 (character index 2)
        RACE_AT_POS3: ['iu', 'ih', 'il', 'ig', 'is', 'ii', 'ia', 'ik'],
        // Shield special handling
        SHIELD: ['id'],
        // Weapon - NO RACE IN PATTERN
        WEAPON: ['iw'],
        // Items without race
        NO_RACE: ['co', 'mo'] // coin, mount, etc.
    };

    // Armor prefixes
    const ARMOR_PREFIXES = ['iu', 'ih', 'il', 'ig', 'is'];

    // CSS is now loaded via manifest.json (content.css)
    // No need for manual style injection

    // Build UI with Shield Support
    const box = document.createElement('div');
    box.id = 'rfFixer';
    box.innerHTML = `
        <div id="rfFixerHeader">
            <div style="display:flex;align-items:center;gap:8px;">
                <div style="width:24px;height:24px;background:linear-gradient(135deg,#5865F2,#4752C4);border-radius:6px;display:flex;align-items:center;justify-content:center;overflow:hidden;"><img src="${chrome.runtime.getURL('icons/icon48.png')}" style="width:18px;height:18px;object-fit:contain;display:block;"></div>
                <div style="font-weight:bold;font-size:14px;">EZ Fix</div>
            </div>
            <div class="header-controls">
                <button class="control-btn" id="minimizeBtn" title="Minimize">─</button>
                <button class="control-btn" id="closeBtn" title="Close">✕</button>
            </div>
        </div>
        <div id="rfFixerBody">
            <div id="raceDisplay" class="race-display">🎯 Detecting...</div>
            <div id="itemStats" class="item-stats">📊 Scanned: 0 | Fixed: 0 | Mismatch: 0</div>
            <div id="databaseStatus" class="database-status loading">🔄 Loading database...</div>

            <div class="action-buttons" style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
                <button id="scanBtn">🔍 Scan</button>
                <button id="fixBtn">🛠️ Fix All</button>
                <button id="undoBtn" disabled>↶ Undo</button>
                <button id="redoBtn" disabled>↷ Redo</button>
                <span id="historyCount" style="font-size:10px;color:#72767d;white-space:nowrap;">0/10</span>
            </div>

            <div class="armor-type-buttons">
                <button class="armor-btn warrior" data-type="w"><span>⚔</span>Warrior</button>
                <button class="armor-btn ranger" data-type="r"><span>🏹</span>Ranger</button>
                <button class="armor-btn force" data-type="f"><span>🔮</span>Force</button>
            </div>

            <div class="accessory-title">🛡️ ACCESSORY TYPE</div>
            <div class="accessory-type-buttons">
                <button class="accessory-btn defense" data-type="defense"><span>🛡️</span>Defense</button>
                <button class="accessory-btn avoid" data-type="avoid"><span>💨</span>Avoid</button>
            </div>

            <div class="accessory-title">🧥 CLOAK TYPE</div>
            <div class="cloak-type-buttons">
                <button class="cloak-btn defense" data-type="cloak-defense"><span>🛡️</span>Defense</button>
                <button class="cloak-btn avoid" data-type="cloak-avoid"><span>💨</span>Avoid</button>
            </div>

            <div class="accessory-title">🛡️ SHIELD TYPE</div>
            <div class="shield-type-buttons">
                <button class="shield-btn defense" data-type="defense"><span>🛡️</span>Defense</button>
                <button class="shield-btn subshield" data-type="subshield"><span>🔰</span>Sub Shield</button>
            </div>

            <div class="section-title">📦 SCANNED ITEMS</div>
            <div class="scan-filter-bar">
                <button class="scan-filter-btn active" id="filterAll">All</button>
                <button class="scan-filter-btn mismatch" id="filterMismatch">⚠️ Mismatch</button>
                <button class="scan-filter-btn ok" id="filterOk">✅ Correct</button>
            </div>
            <input id="rfFixerSearch" placeholder="Search scanned items" />
            <div id="itemList" class="list-container">
                <div class="empty-message">No items scanned yet</div>
            </div>

            <div class="section-title">✅ FIXED ITEMS HISTORY</div>
            <div id="fixLog" class="list-container">
                <div class="empty-message">No fixes applied yet</div>
            </div>

            <div style="margin-top:15px;text-align:center;color:#b5bac1;font-size:11px;">
                Made by <a href="https://discord.com/users/334621293125304331" target="_blank" class="erza-discord">ERZA</a>
            </div>
        </div>
    `;
    document.body.appendChild(box);

    // Toast notification (menggantikan alert)
    const toastEl = document.createElement('div');
    toastEl.id = 'rfToast';
    document.body.appendChild(toastEl);

    let toastTimer = null;
    function showToast(message, type = 'info', duration = 2200) {
        // type: 'success' | 'error' | 'warn' | 'info'
        toastEl.textContent = message;
        toastEl.className = `show toast-${type}`;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastEl.classList.remove('show');
        }, duration);
    }

    // Filter toggle handler
    function rfFilterClick(filter) {
        currentScanFilter = filter;
        document.querySelectorAll('.scan-filter-btn').forEach(btn => btn.classList.remove('active'));
        const map = { all: 'filterAll', mismatch: 'filterMismatch', ok: 'filterOk' };
        document.getElementById(map[filter])?.classList.add('active');
        renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
    }

    // Bind filter buttons via addEventListener
    document.getElementById('filterAll').addEventListener('click', () => rfFilterClick('all'));
    document.getElementById('filterMismatch').addEventListener('click', () => rfFilterClick('mismatch'));
    document.getElementById('filterOk').addEventListener('click', () => rfFilterClick('ok'));

    // Race data
    const raceData = {
        'a': {name: 'Accretia', emoji: '🤖', badge: 'race-a'},
        'b': {name: 'Bellato', emoji: '👨‍🚀', badge: 'race-b'},
        'c': {name: 'Cora', emoji: '🧝', badge: 'race-c'},
        'all': {name: 'All Races', emoji: '🌍', badge: 'race-all'},
        'unknown': {name: 'Unknown', emoji: '❓', badge: 'race-unknown'}
    };

    // ==================== HELPER FUNCTIONS (UPDATED FOR COUNCIL ARMOR) ====================
    function extractUniqueNumber(itemCode) {
        if (!itemCode || itemCode.length < 5) return null;
        
        const prefix = itemCode.substring(0, 2);
        
        // ===== ARMOR SPECIAL HANDLING =====
        if (ARMOR_PREFIXES.includes(prefix)) {
            // Check for council armor (character at index 3 is 'c')
            if (itemCode.length >= 6 && itemCode[3] === 'c') {
                // COUNCIL ARMOR: iubcw55 -> extract "55" (skip iubcw)
                return itemCode.substring(5);
            } else {
                // STANDARD ARMOR: iubwb55 -> extract "wb55" atau "b55" (skip iubw)
                return itemCode.substring(4);
            }
        }
        
        // For other item types (keep original logic)
        if (itemCode.startsWith('ik')) {
            // Cloak: ikbty01 -> 01
            return itemCode.substring(itemCode.length - 2);
        } else if (itemCode.startsWith('id')) {
            // Shield: idbcb70 -> 70
            return itemCode.substring(itemCode.length - 2);
        } else if (itemCode.startsWith('ii') || itemCode.startsWith('ia')) {
            // Ring/Amulet: iibby01 -> 01
            return itemCode.substring(itemCode.length - 2);
        } else if (itemCode.startsWith('iw')) {
            // Weapon: iwdka81 -> 81
            return itemCode.substring(itemCode.length - 2);
        } else {
            // Normal items: try to extract
            const matches = itemCode.match(/\d+/g);
            return matches ? matches[matches.length - 1] : null;
        }
    }

    function extractBaseCode(itemCode) {
        if (!itemCode) return null;
        
        const prefix = itemCode.substring(0, 2);
        
        // ===== ARMOR SPECIAL HANDLING =====
        if (ARMOR_PREFIXES.includes(prefix)) {
            // Check for council armor
            if (itemCode.length >= 6 && itemCode[3] === 'c') {
                // Council armor: iubcw55 -> "iubc"
                return itemCode.substring(0, 4);
            } else {
                // Standard armor: iubwb55 -> "iub"
                return itemCode.substring(0, 3);
            }
        }
        
        // For other items (keep original logic)
        if (itemCode.startsWith('ik')) {
            // Cloak: ikbty01 -> ikbty
            return itemCode.substring(0, 5);
        } else if (itemCode.startsWith('id')) {
            // Shield: idbcb70 -> idbcb
            return itemCode.substring(0, 5);
        } else if (itemCode.startsWith('ii') || itemCode.startsWith('ia')) {
            // Ring/Amulet: iibby01 -> iibby
            return itemCode.substring(0, 5);
        } else if (itemCode.startsWith('iw')) {
            // Weapon: iwdka81 -> iwdka
            return itemCode.substring(0, 5);
        }
        
        return itemCode;
    }

    function getRaceColor(raceCode) {
        const colorMap = {
            'c': '#c100d1', // Cora purple
            'b': '#e06161', // Bellato red
            'a': '#aeaeae', // Accretia gray
            'all': '#27ae60', // All races green
            'unknown': '#95a5a6' // Unknown gray
        };
        return colorMap[raceCode] || '#ffffff';
    }

    // ==================== RACE DETECTION ====================
    function detectItemRace(itemCode) {
        if (!itemCode || itemCode.length < 2) return null;
        
        const prefix = itemCode.substring(0, 2);
        
        // ===== 1. DATABASE FIRST (MOST ACCURATE) =====
        if (itemDatabase && itemDatabase.byCode[itemCode]) {
            const dbItem = itemDatabase.byCode[itemCode];
            if (dbItem.race) {
                return dbItem.race;
            }
        }
        
        // ===== 2. ARMOR SPECIAL HANDLING =====
        if (ARMOR_PREFIXES.includes(prefix)) {
            // Untuk armor, race selalu di posisi ke-3 (index 2)
            if (itemCode.length >= 3) {
                const raceChar = itemCode[2];
                if (['a', 'b', 'c'].includes(raceChar)) {
                    return raceChar;
                }
            }
            return 'unknown';
        }
        
        // ===== 3. WEAPONS SPECIAL HANDLING =====
        if (prefix === 'iw') {
            const weaponType = itemCode.substring(2, 4);
            
            // STANDARD WEAPONS - USABLE BY ALL RACES
            if (STANDARD_WEAPON_TYPES.includes(weaponType)) {
                return 'all';
            }
            
            // CUSTOM/EPIC WEAPONS (iwepcXX) - Check database
            if (itemDatabase) {
                const uniqueNum = extractUniqueNumber(itemCode);
                const allWeapons = Object.values(itemDatabase.byCode)
                    .filter(item => item.code.startsWith('iwepc'));
                
                // Find weapon with same unique number
                const sameGradeWeapon = allWeapons.find(w => 
                    extractUniqueNumber(w.code) === uniqueNum
                );
                
                if (sameGradeWeapon) {
                    return sameGradeWeapon.race;
                }
            }
            
            return 'unknown';
        }
        
        // ===== 4. ARMOR & ACCESSORY (RACE AT POSITION 3) =====
        if (ITEM_CATEGORIES.RACE_AT_POS3.includes(prefix)) {
            if (itemCode.length >= 3) {
                const raceChar = itemCode[2];
                if (['a', 'b', 'c'].includes(raceChar)) {
                    return raceChar;
                }
            }
            return 'unknown';
        }
        
        // ===== 5. SHIELD SPECIAL PATTERN =====
        if (prefix === 'id') {
            if (itemCode.length >= 4) {
                const raceMarker = itemCode.substring(2, 4);
                if (raceMarker === 'aa') return 'a';
                if (raceMarker === 'bc') {
                    if (itemCode.length >= 5) {
                        return itemCode[4] === 'b' ? 'b' : 'c';
                    }
                    return 'unknown';
                }
            }
            return 'unknown';
        }
        
        // ===== 6. ITEMS WITHOUT RACE =====
        if (ITEM_CATEGORIES.NO_RACE.includes(prefix)) {
            return null;
        }
        
        return 'unknown';
    }

    // ==================== PLAYER DETECTION ====================
    function detectPlayerInfo() {
        try {
            // Primary: XPath + CSS selector for player nickname element
            const cssSelector = '#rzr > div > div > div > div > table > tbody > tr:nth-child(2) > td > table > tbody > tr > td:nth-child(2) > div:nth-child(1) > b > font';
            const xpath = '//*[@id="rzr"]/div/div/div/div/table/tbody/tr[2]/td/table/tbody/tr/td[2]/div[1]/b/font';
            
            // Try CSS selector first (faster), then XPath as fallback
            let nicknameElement = document.querySelector(cssSelector);
            
            if (!nicknameElement) {
                const result = document.evaluate(
                    xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                );
                nicknameElement = result.singleNodeValue;
            }
            
            if (nicknameElement) {
                const nickname = (nicknameElement.textContent || '').trim();
                
                // Detect race from nickname color
                let race = null;
                
                // Check from color attribute
                const colorAttr = nicknameElement.getAttribute('color');
                if (colorAttr === '#c100d1') race = 'c';
                else if (colorAttr === '#e06161') race = 'b';
                else if (colorAttr === '#aeaeae') race = 'a';
                
                // If no attribute, check computed style
                if (!race) {
                    const computedColor = window.getComputedStyle(nicknameElement).color;
                    if (computedColor === 'rgb(193, 0, 209)') race = 'c';
                    else if (computedColor === 'rgb(224, 97, 97)') race = 'b';
                    else if (computedColor === 'rgb(174, 174, 174)') race = 'a';
                }
                
                if (nickname && race) {
                    log(`🎯 Player detected: "${nickname}" (${raceData[race]?.name})`);
                    return {
                        nickname: nickname,
                        race: race
                    };
                }
            }
        } catch (error) {
            log('XPath detection error:', error);
        }
        
        // Fallback: Find font elements with race colors
        const raceColors = {
            '#c100d1': 'c',
            '#e06161': 'b',
            '#aeaeae': 'a'
        };
        
        for (const [color, race] of Object.entries(raceColors)) {
            const elements = document.querySelectorAll(`#rzr font[color="${color}"]`);
            for (const el of elements) {
                const nickname = (el.textContent || '').trim();
                if (nickname) {
                    return { nickname: nickname, race: race };
                }
            }
        }
        
        return { nickname: null, race: null };
    }

    // ==================== DATABASE LAYER ====================
    async function loadItemDatabase(forceRefresh = false) {
        const now = Date.now();
        
        if (!forceRefresh && itemDatabase && (now - lastCacheTime < CACHE_DURATION)) {
            updateDatabaseStatus('success', `Database loaded (cached)`);
            return itemDatabase;
        }
        
        try {
            updateDatabaseStatus('loading', 'Loading database from Google Sheets...');
            
            const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const text = await response.text();
            const json = JSON.parse(text.substring(47).slice(0, -2));
            
            const database = {
                byCode: {},
                byBaseCode: {},
                byGrade: {},
                byTypeRaceOptionGrade: {},
                shieldOptionMap: {},
                uniqueNumberMap: {},
                metadata: { lastUpdated: now, totalItems: 0 }
            };
            
            log(`📊 Database rows: ${json.table.rows.length}`);
            
            // Process database rows
            for (let i = 1; i < json.table.rows.length; i++) {
                const row = json.table.rows[i];
                if (!row.c || row.c.length < 7) continue;
                
                const bellatoCode = (row.c[0]?.v || '').toString().trim().toLowerCase();
                const coraCode = (row.c[1]?.v || '').toString().trim().toLowerCase();
                const accretiaCode = (row.c[2]?.v || '').toString().trim().toLowerCase();
                const type = (row.c[3]?.v || '').toString().trim().toLowerCase();
                // Normalize option: remove spaces so "sub shield" -> "subshield"
                const option = (row.c[4]?.v || '').toString().trim().toLowerCase().replace(/\s+/g, '');
                const grade = (row.c[5]?.v || '').toString().trim().toLowerCase();
                const note = (row.c[6]?.v || '').toString().trim();
                
                if (!bellatoCode && !coraCode && !accretiaCode) continue;
                
                // If all three races share the same code, treat as all-races item (no conversion needed)
                const isAllRaces = bellatoCode && coraCode && accretiaCode &&
                                   bellatoCode === coraCode && coraCode === accretiaCode;

                // Check if Bellato=Cora (shield case: B=C tapi A berbeda)
                const isBellatoCora = bellatoCode && coraCode && bellatoCode === coraCode && bellatoCode !== accretiaCode;

                // Process each race
                [
                    { race: 'b', code: bellatoCode },
                    { race: 'c', code: coraCode },
                    { race: 'a', code: accretiaCode }
                ].forEach(({ race, code }) => {
                    if (!code) return;
                    
                    const uniqueNumber = extractUniqueNumber(code);
                    const baseCode = extractBaseCode(code);
                    
                    // Normalize option
                    let normalizedOption = option;
                    let shieldNumber = null;
                    
                    if (type === 'shield') {
                        normalizedOption = option.includes('sub') ? 'subshield' : 'defense';
                        shieldNumber = uniqueNumber;
                    }
                    
                    const itemData = {
                        code: code,
                        race: isAllRaces ? 'all' : (isBellatoCora && (code === bellatoCode || code === coraCode) ? 'bc' : race),
                        type: type,
                        option: normalizedOption,
                        grade: grade,
                        note: note,
                        uniqueNumber: uniqueNumber,
                        shieldNumber: shieldNumber,
                        baseCode: baseCode,
                        isCustom: true,
                        isConvertible: !isAllRaces && !(isBellatoCora && (code === bellatoCode || code === coraCode)),
                        originalRow: i
                    };
                    
                    // Store in byCode
                    database.byCode[code] = itemData;
                    
                    // Store by grade
                    if (grade) {
                        if (!database.byGrade[grade]) {
                            database.byGrade[grade] = {};
                        }
                        database.byGrade[grade][code] = itemData;
                    }
                    
                    // Base code mapping
                    if (baseCode) {
                        if (!database.byBaseCode[baseCode]) {
                            database.byBaseCode[baseCode] = {};
                        }
                        database.byBaseCode[baseCode][race] = code;
                    }
                    
                    // Type+Option+Race+Grade grouping
                    // For B=C items: store in 3 keys ('bc', 'b', 'c') so convertRace can find them
                    const racesToStore = isBellatoCora && (race === 'b' || race === 'c') 
                        ? ['bc', 'b', 'c'] 
                        : [isAllRaces ? 'all' : (isBellatoCora ? 'bc' : race)];
                    
                    racesToStore.forEach(raceKey => {
                        const typeKey = `${type}|${normalizedOption}|${raceKey}|${grade}`;
                        if (!database.byTypeRaceOptionGrade[typeKey]) {
                            database.byTypeRaceOptionGrade[typeKey] = [];
                        }
                        if (!database.byTypeRaceOptionGrade[typeKey].includes(code)) {
                            database.byTypeRaceOptionGrade[typeKey].push(code);
                        }
                    });
                    
                    // Shield mapping
                    if (type === 'shield' && shieldNumber) {
                        const shieldKey = `${normalizedOption}|${shieldNumber}`;
                        if (!database.shieldOptionMap[shieldKey]) {
                            database.shieldOptionMap[shieldKey] = {};
                        }
                        database.shieldOptionMap[shieldKey][race] = code;
                    }
                    
                    // Unique number mapping
                    if (uniqueNumber) {
                        const uniqueKey = `${type}|${normalizedOption}|${uniqueNumber}`;
                        if (!database.uniqueNumberMap[uniqueKey]) {
                            database.uniqueNumberMap[uniqueKey] = {};
                        }
                        database.uniqueNumberMap[uniqueKey][race] = code;
                    }
                });
            }
            
            database.metadata.totalItems = Object.keys(database.byCode).length;
            itemDatabase = database;
            lastCacheTime = now;

            // ===== VALIDASI DATABASE =====
            const warnings = validateDatabase(json.table.rows);
            database.metadata.warnings = warnings;

            if (warnings.length > 0) {
                updateDatabaseStatus('warn', `⚠️ ${database.metadata.totalItems} items (${warnings.length} peringatan)`);
                renderDatabaseWarnings(warnings);
            } else {
                updateDatabaseStatus('success', `✅ Loaded ${database.metadata.totalItems} items — OK`);
            }

            log(`✅ Database loaded: ${database.metadata.totalItems} items`);
            return database;
            
        } catch (error) {
            logError('Database error:', error);
            updateDatabaseStatus('error', 'Failed to load database');
            return getFallbackDatabase();
        }
    }

    // ==================== WEAPON DATABASE ====================
    async function loadWeaponDatabase(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && weaponDatabase && (now - lastWeaponCacheTime < CACHE_DURATION)) {
            return weaponDatabase;
        }

        try {
            const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(WEAPON_SHEET_NAME)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const text = await response.text();
            const json = JSON.parse(text.substring(47).slice(0, -2));

            // byGrade: { 'excellent': [{code, type, grade, note}, ...], ... }
            const db = { byGrade: {}, byCode: {}, allWeapons: [] };

            for (let i = 1; i < json.table.rows.length; i++) {
                const row = json.table.rows[i];
                if (!row.c || row.c.length < 3) continue;

                const code  = (row.c[0]?.v || '').toString().trim().toLowerCase();
                const type  = (row.c[1]?.v || '').toString().trim().toLowerCase();
                const grade = (row.c[2]?.v || '').toString().trim().toLowerCase();
                const note  = (row.c[3]?.v || '').toString().trim();

                if (!code || !grade) continue;

                const item = { code, type, grade, note };
                db.byCode[code] = item;
                db.allWeapons.push(item);

                if (!db.byGrade[grade]) db.byGrade[grade] = [];
                db.byGrade[grade].push(item);
            }

            weaponDatabase = db;
            lastWeaponCacheTime = now;
            log(`✅ Weapon DB loaded: ${db.allWeapons.length} weapons`);
            return db;

        } catch (error) {
            logError('Weapon DB error:', error);
            weaponDatabase = null;
            return null;
        }
    }

    // ==================== WEAPON SELECTOR FLOATING POPUP ====================
    function closeWeaponPopup() {
        const existing = document.getElementById('weaponFloatingPopup');
        if (existing) existing.remove();
        selectedWeaponInput = null;
    }

    function showWeaponSelector(item) {
        // Tutup popup sebelumnya jika ada
        closeWeaponPopup();

        // ── Validasi database ──
        if (!weaponDatabase) {
            showToast('⚠️ Weapon DB belum ter-load. Klik Refresh DB.', 'warn');
            focusOnItem(item.input);
            return;
        }
        if (Object.keys(weaponDatabase.byCode).length === 0) {
            showToast('⚠️ Weapon DB kosong — cek sheet "weapons".', 'warn');
            focusOnItem(item.input);
            return;
        }

        const currentCode = item.code;

        if (!weaponDatabase.byCode[currentCode]) {
            showToast(`⚠️ "${currentCode}" tidak ada di weapon database`, 'error');
            focusOnItem(item.input);
            return;
        }

        // Scroll & focus input field dulu, tunggu selesai baru tampilkan popup
        focusOnItem(item.input);
        selectedWeaponInput = item.input;

        const currentGrade = weaponDatabase.byCode[currentCode].grade;
        const candidates = weaponDatabase.byGrade[currentGrade] || [];

        // Tunggu scroll smooth selesai (~400ms) agar getBoundingClientRect akurat
        setTimeout(() => {
        // ── Hitung posisi popup di sebelah kanan elemen visible (bukan hidden input) ──
        const visibleEl = getVisibleElement(item.input);
        const inputRect = visibleEl.getBoundingClientRect();
        // Fallback jika rect masih nol (hidden element): gunakan posisi tengah layar
        const rectValid = inputRect.width > 0 || inputRect.height > 0;
        const popupWidth = 260;
        let popupLeft, popupTop;

        if (!rectValid) {
            // Posisi fallback: tengah horizontal, sedikit dari atas
            popupLeft = Math.max(8, (window.innerWidth - popupWidth) / 2);
            popupTop = 120;
        } else {
            const spaceRight = window.innerWidth - inputRect.right - 8;
            const spaceLeft  = inputRect.left - 8;
            if (spaceRight >= popupWidth) {
                popupLeft = inputRect.right + 8;
            } else if (spaceLeft >= popupWidth) {
                popupLeft = inputRect.left - popupWidth - 8;
            } else {
                popupLeft = Math.max(8, Math.min(inputRect.left, window.innerWidth - popupWidth - 8));
            }
            popupTop = Math.min(inputRect.top, window.innerHeight - 360);
            popupTop = Math.max(8, popupTop);
        }

        // ── Buat popup element ──
        const popup = document.createElement('div');
        popup.id = 'weaponFloatingPopup';
        popup.style.cssText = `
            position: fixed;
            left: ${popupLeft}px;
            top: ${popupTop}px;
            width: ${popupWidth}px;
            background: #2f3136;
            border: 2px solid #5865F2;
            border-radius: 10px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.7);
            font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            color: #dcddde;
            z-index: 10002;
            overflow: hidden;
        `;

        const gradeColor = '#9b59b6';
        popup.innerHTML = `
            <div style="padding:10px 12px 8px;background:#202225;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #40444b;">
                <div style="font-size:14px;font-weight:bold;display:flex;align-items:center;gap:6px;">
                    <span>⚔️</span>
                    <span style="color:#dcddde;">${escapeHtml(currentCode)}</span>
                    <span style="font-size:12px;background:${gradeColor};color:white;padding:2px 6px;border-radius:4px;font-weight:bold;">${escapeHtml(currentGrade).toUpperCase()}</span>
                </div>
                <button id="wpClose" style="background:none;border:none;color:#8e9297;cursor:pointer;font-size:16px;padding:2px 5px;border-radius:4px;line-height:1;" title="Tutup">✕</button>
            </div>
            <div style="padding:8px 10px 6px;">
                <input id="wpSearch" placeholder="🔍 Search code atau nama..." autocomplete="off"
                    style="width:calc(100% - 14px);padding:6px 6px;border-radius:6px;border:1px solid #40444b;background:#202225;color:#dcddde;font-size:14px;outline:none;" />
            </div>
            <div id="wpList" style="max-height:260px;overflow-y:auto;padding:0 6px 8px;"></div>
        `;
        document.body.appendChild(popup);

        // ── Render list ──
        const wpList = document.getElementById('wpList');

        function renderList(filterText) {
            wpList.innerHTML = '';
            const ft = (filterText || '').toLowerCase().trim();
            const filtered = ft
                ? candidates.filter(w =>
                    w.code.includes(ft) ||
                    (w.note || '').toLowerCase().includes(ft) ||
                    (w.type || '').toLowerCase().includes(ft))
                : candidates;

            if (filtered.length === 0) {
                wpList.innerHTML = '<div style="text-align:center;color:#72767d;padding:14px;font-size:14px;font-style:italic;">Tidak ditemukan</div>';
                return;
            }

            function hl(text) {
                if (!ft || !text) return escapeHtml(text || '');
                const idx = text.toLowerCase().indexOf(ft);
                if (idx === -1) return escapeHtml(text);
                return escapeHtml(text.substring(0, idx))
                    + `<mark style="background:#5865F2;color:white;border-radius:2px;padding:0 1px;">${escapeHtml(text.substring(idx, idx + ft.length))}</mark>`
                    + escapeHtml(text.substring(idx + ft.length));
            }

            // Group by type
            const byType = {};
            filtered.forEach(w => {
                if (!byType[w.type]) byType[w.type] = [];
                byType[w.type].push(w);
            });

            const multiType = Object.keys(byType).length > 1;

            Object.entries(byType).forEach(([wtype, weapons]) => {
                if (multiType) {
                    const th = document.createElement('div');
                    th.style.cssText = 'font-size:12px;color:#72767d;text-transform:uppercase;font-weight:bold;padding:6px 4px 3px;letter-spacing:0.5px;';
                    th.textContent = `— ${wtype} —`;
                    wpList.appendChild(th);
                }

                weapons.forEach(w => {
                    const row = document.createElement('div');
                    const isCurrent = w.code === currentCode;
                    row.style.cssText = `
                        display:flex;justify-content:space-between;align-items:center;
                        padding:7px 8px;border-radius:6px;cursor:pointer;margin:2px 0;
                        border-left:3px solid ${isCurrent ? '#5865F2' : 'transparent'};
                        background:${isCurrent ? 'rgba(88,101,242,0.15)' : 'transparent'};
                        transition:background 0.15s;
                    `;

                    row.innerHTML = `
                        <div style="display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;">
                            ${isCurrent ? '<span style="color:#5865F2;font-size:10px;flex-shrink:0;">●</span>' : ''}
                            <strong style="font-size:14px;white-space:nowrap;">${hl(w.code)}</strong>
                        </div>
                        <span style="font-size:13px;color:#8e9297;text-align:right;flex-shrink:0;margin-left:6px;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(w.note || w.type)}">${hl(w.note || w.type)}</span>
                    `;

                    row.addEventListener('mouseenter', () => {
                        if (!isCurrent) row.style.background = 'rgba(88,101,242,0.1)';
                    });
                    row.addEventListener('mouseleave', () => {
                        if (!isCurrent) row.style.background = 'transparent';
                    });

                    row.addEventListener('click', () => {
                        if (!selectedWeaponInput) return;
                        if (w.code === selectedWeaponInput.value.trim().toLowerCase()) {
                            showToast('✅ Weapon sudah sama', 'info');
                            closeWeaponPopup();
                            return;
                        }
                        const oldCode = selectedWeaponInput.value;
                        selectedWeaponInput.value = w.code;
                        selectedWeaponInput.dispatchEvent(new Event('input', { bubbles: true }));
                        selectedWeaponInput.dispatchEvent(new Event('change', { bubbles: true }));

                        pushUndo('Weapon Replace', [{ input: selectedWeaponInput, oldCode, newCode: w.code }]);
                        currentFixedItems.push({ input: selectedWeaponInput, oldCode, newCode: w.code, timestamp: new Date().toLocaleTimeString() });

                        showToast(`✅ ${escapeHtml(oldCode)} → ${escapeHtml(w.code)}`, 'success');
                        currentScannedItems = scanPlayerItems();
                        renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
                        updateItemStats();
                        renderFixedItems();
                        closeWeaponPopup();
                    });

                    wpList.appendChild(row);
                });
            });
        }

        renderList('');

        // Search
        const wpSearch = document.getElementById('wpSearch');
        let searchTimer = null;
        wpSearch.addEventListener('input', e => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => renderList(e.target.value), 180);
        });
        wpSearch.addEventListener('focus', () => { wpSearch.style.borderColor = '#5865F2'; });
        wpSearch.addEventListener('blur',  () => { wpSearch.style.borderColor = '#40444b'; });

        // Tutup tombol ✕
        document.getElementById('wpClose').addEventListener('click', closeWeaponPopup);

        // Klik di luar popup → tutup
        function onOutsideClick(e) {
            if (!popup.contains(e.target) && e.target !== item.input) {
                closeWeaponPopup();
                document.removeEventListener('mousedown', onOutsideClick);
            }
        }
        setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 100);

        // Escape → tutup
        function onEscape(e) {
            if (e.key === 'Escape') {
                closeWeaponPopup();
                document.removeEventListener('keydown', onEscape);
            }
        }
        document.addEventListener('keydown', onEscape);

        // Auto-focus search
        setTimeout(() => wpSearch.focus(), 60);

        }, 420); // end setTimeout — tunggu scroll smooth selesai
    }

    function updateDatabaseStatus(status, message) {
        const statusEl = document.getElementById('databaseStatus');
        if (statusEl) {
            statusEl.className = `database-status ${status}`;
            statusEl.textContent = message;
        }
    }

    function validateDatabase(rows) {
        const VALID_TYPES = ['armor','weapon','shield','cloak','ring','amulet','potion','umt',
                             'helmet','upper','lower','gauntlet','shoes','scroll'];
        const VALID_OPTIONS = ['defense','avoid','subshield','injurer','cure','hp','fp','sp',
                               'w','r','f','warrior','ranger','force','none'];
        const warnings = [];
        const seenCodes = {};

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row.c || row.c.length < 7) continue;

            const rowNum = i + 1; // nomor baris di Sheets (1-indexed + header)
            const b = (row.c[0]?.v || '').toString().trim().toLowerCase();
            const c = (row.c[1]?.v || '').toString().trim().toLowerCase();
            const a = (row.c[2]?.v || '').toString().trim().toLowerCase();
            const type = (row.c[3]?.v || '').toString().trim().toLowerCase();
            const option = (row.c[4]?.v || '').toString().trim().toLowerCase().replace(/\s+/g, '');
            const grade = (row.c[5]?.v || '').toString().trim();
            const note = (row.c[6]?.v || '').toString().trim();

            if (!b && !c && !a) continue;

            // 1. Type tidak dikenal
            if (type && !VALID_TYPES.includes(type)) {
                warnings.push({ row: rowNum, note, level: 'error',
                    msg: `Unknown type: "${type}"` });
            }

            // 2. Option tidak dikenal
            if (option && !VALID_OPTIONS.includes(option)) {
                warnings.push({ row: rowNum, note, level: 'warn',
                    msg: `Unknown option: "${option}"` });
            }

            // 3. Grade kosong
            if (!grade) {
                warnings.push({ row: rowNum, note, level: 'warn',
                    msg: `Grade kosong` });
            }

            // 4. Kode terlalu pendek atau terlalu panjang
            for (const [raceName, code] of [['Bellato', b], ['Cora', c], ['Accretia', a]]) {
                if (!code) continue;
                if (code.length < 5) {
                    warnings.push({ row: rowNum, note, level: 'error',
                        msg: `Kode ${raceName} terlalu pendek: "${code}" (min 5 karakter)` });
                } else if (code.length > 12) {
                    warnings.push({ row: rowNum, note, level: 'warn',
                        msg: `Kode ${raceName} terlalu panjang: "${code}" (max 12 karakter)` });
                }
            }

            // 5. Kode duplikat
            for (const code of [b, c, a]) {
                if (!code) continue;
                if (seenCodes[code] && seenCodes[code] !== i) {
                    warnings.push({ row: rowNum, note, level: 'error',
                        msg: `Kode duplikat: "${code}" sudah ada di baris ${seenCodes[code] + 1}` });
                } else {
                    seenCodes[code] = i;
                }
            }

            // 6. Note kosong
            if (!note) {
                warnings.push({ row: rowNum, note: `baris ${rowNum}`, level: 'info',
                    msg: `Kolom NOTE kosong` });
            }

            // 7. Item non-all-race tanpa pasangan option (defense tanpa avoid atau sebaliknya)
            // Hanya cek untuk ring, amulet, cloak
            if (['ring','amulet','cloak'].includes(type) && b !== c) {
                // race specific — pasangan dicek via grade nanti (terlalu kompleks di sini)
            }
        }

        return warnings;
    }

    function renderDatabaseWarnings(warnings) {
        // Tampilkan di bawah databaseStatus
        let warningEl = document.getElementById('dbWarnings');
        if (!warningEl) {
            warningEl = document.createElement('div');
            warningEl.id = 'dbWarnings';
            warningEl.style.cssText = 'margin-top:6px;max-height:120px;overflow-y:auto;';
            const statusEl = document.getElementById('databaseStatus');
            statusEl.parentNode.insertBefore(warningEl, statusEl.nextSibling);
        }

        const errors = warnings.filter(w => w.level === 'error');
        const warns = warnings.filter(w => w.level === 'warn');
        const infos = warnings.filter(w => w.level === 'info');

        let html = `<div style="font-size:10px;margin-bottom:4px;color:#b5bac1;">
            <span style="color:#ed4245">● ${errors.length} error</span> &nbsp;
            <span style="color:#f39c12">● ${warns.length} warning</span> &nbsp;
            <span style="color:#5865F2">● ${infos.length} info</span>
            <span style="float:right;cursor:pointer;color:#5865F2;" onclick="
                const el=document.getElementById('dbWarningList');
                el.style.display=el.style.display==='none'?'block':'none';
                this.textContent=el.style.display==='none'?'▶ lihat':'▼ tutup';
            ">▶ lihat</span>
        </div>`;

        html += `<div id="dbWarningList" style="display:none;">`;
        for (const w of warnings) {
            const color = w.level === 'error' ? '#ed4245' : w.level === 'warn' ? '#f39c12' : '#5865F2';
            const icon = w.level === 'error' ? '❌' : w.level === 'warn' ? '⚠️' : 'ℹ️';
            html += `<div style="font-size:10px;padding:3px 6px;margin:2px 0;background:#1e1f22;border-radius:4px;border-left:2px solid ${color};">
                ${icon} <span style="color:#b5bac1">Baris ${w.row}</span>
                <span style="color:${color}"> ${escapeHtml(w.msg)}</span>
                ${w.note ? `<span style="color:#72767d"> — ${escapeHtml(w.note)}</span>` : ''}
            </div>`;
        }
        html += `</div>`;

        warningEl.innerHTML = html;
    }

    function getFallbackDatabase() {
        return {
            byCode: {},
            byBaseCode: {},
            byGrade: {},
            byTypeRaceOptionGrade: {},
            shieldOptionMap: {},
            uniqueNumberMap: {},
            metadata: { totalItems: 0 }
        };
    }

    // ==================== ITEM ANALYSIS (UPDATED FOR COUNCIL ARMOR) ====================
    function analyzeItem(itemCode) {
        if (!itemCode || itemCode.length < 5) return null;
        
        const prefix = itemCode.substring(0, 2);
        
        // ===== 1. CHECK DATABASE FIRST =====
        if (itemDatabase && itemDatabase.byCode[itemCode]) {
            const dbItem = itemDatabase.byCode[itemCode];
            log(`📖 Found in DB: ${itemCode} -> ${JSON.stringify(dbItem)}`);

            // Untuk armor: hitung needsType dan isCouncil dari kode item
            // Termasuk sub-type: helmet, upper, lower, gauntlet, shoes
            const ARMOR_SUBTYPES = ['armor','helmet','upper','lower','gauntlet','shoes'];
            let needsType = false;
            let isCouncil = false;
            if (ARMOR_SUBTYPES.includes(dbItem.type) && ARMOR_PREFIXES.includes(prefix)) {
                isCouncil = itemCode[3] === 'c';
                needsType = true;
            }
            
            return {
                code: itemCode,
                race: dbItem.race,
                type: dbItem.type,
                option: dbItem.option,
                grade: dbItem.grade,
                uniqueNumber: dbItem.uniqueNumber,
                shieldNumber: dbItem.shieldNumber,
                baseCode: dbItem.baseCode,
                prefix: prefix,
                isCustom: true,
                isConvertible: dbItem.isConvertible !== false && dbItem.race !== 'all' && dbItem.race !== 'bc',
                needsFix: dbItem.race !== 'all' && 
                         ((dbItem.race === 'bc' && currentPlayerRace === 'a') ||  // B=C invalid for Accretia
                          (dbItem.race !== 'bc' && dbItem.isConvertible !== false && dbItem.race !== currentPlayerRace)),  // Normal race mismatch
                needsType: needsType,
                isCouncil: isCouncil,
                note: dbItem.note,
                source: 'database-exact'
            };
        }
        
        // ===== 2. ARMOR ANALYSIS =====
        if (ARMOR_PREFIXES.includes(prefix)) {
            if (itemCode.length < 6) return null;
            
            const raceChar = itemCode[2];
            const thirdChar = itemCode[3];
            const isCouncil = thirdChar === 'c';
            
            if (isCouncil) {
                // COUNCIL ARMOR: iubcw55
                if (itemCode.length < 7) return null;
                
                const classType = itemCode[4]; // w/r/f
                const uniqueNum = itemCode.substring(5);
                
                return {
                    code: itemCode,
                    race: raceChar,
                    type: 'armor',
                    option: classType,
                    grade: '',
                    uniqueNumber: uniqueNum,
                    baseCode: prefix + raceChar + 'c',
                    prefix: prefix,
                    isCustom: false,
                    isConvertible: true,
                    needsFix: raceChar !== currentPlayerRace,
                    needsType: true,
                    isCouncil: true,
                    classPosition: 4,
                    note: 'Council Armor',
                    source: 'council-armor'
                };
            } else {
                // STANDARD ARMOR: iubwb55
                if (itemCode.length < 7) return null;
                
                const classType = itemCode[3]; // w/r/f
                const uniqueNum = itemCode.substring(4);
                
                return {
                    code: itemCode,
                    race: raceChar,
                    type: 'armor',
                    option: classType,
                    grade: '',
                    uniqueNumber: uniqueNum,
                    baseCode: prefix + raceChar,
                    prefix: prefix,
                    isCustom: false,
                    isConvertible: true,
                    needsFix: raceChar !== currentPlayerRace,
                    needsType: true,
                    isCouncil: false,
                    classPosition: 3,
                    note: 'Standard Armor',
                    source: 'standard-armor'
                };
            }
        }
        
        // ===== 3. Cari item serupa di database =====
        if (itemDatabase) {
            // Untuk weapon custom (iwepcXX)
            if (prefix === 'iw' && itemCode.startsWith('iwepc')) {
                const uniqueNum = extractUniqueNumber(itemCode);
                if (uniqueNum) {
                    const uniqueKey = `weapon|injurer|${uniqueNum}`;
                    const sameUniqueWeapons = itemDatabase.uniqueNumberMap[uniqueKey];
                    
                    if (sameUniqueWeapons) {
                        const knownRace = Object.keys(sameUniqueWeapons).find(race => 
                            ['a', 'b', 'c'].includes(race)
                        );
                        
                        if (knownRace) {
                            const similarItem = itemDatabase.byCode[sameUniqueWeapons[knownRace]];
                            const resolvedRace = similarItem.race === 'all' ? 'all' : knownRace;
                            return {
                                code: itemCode,
                                race: resolvedRace,
                                type: 'weapon',
                                option: 'injurer',
                                grade: similarItem.grade,
                                uniqueNumber: uniqueNum,
                                baseCode: 'iwepc',
                                prefix: prefix,
                                isCustom: true,
                                isConvertible: resolvedRace !== 'all',
                                needsFix: resolvedRace !== 'all' && resolvedRace !== currentPlayerRace,
                                note: similarItem.note || 'Similar weapon found',
                                source: 'database-similar'
                            };
                        }
                    }
                }
            }
            
            // Untuk shield dengan unique number yang sama
            if (prefix === 'id') {
                const uniqueNum = extractUniqueNumber(itemCode);
                if (uniqueNum) {
                    const defenseKey = `shield|defense|${uniqueNum}`;
                    const subKey = `shield|subshield|${uniqueNum}`;
                    
                    const sameUniqueShield = itemDatabase.uniqueNumberMap[defenseKey] || 
                                           itemDatabase.uniqueNumberMap[subKey];
                    
                    if (sameUniqueShield) {
                        const knownRace = Object.keys(sameUniqueShield).find(race => 
                            ['a', 'b', 'c'].includes(race)
                        );
                        
                        if (knownRace) {
                            const similarItem = itemDatabase.byCode[sameUniqueShield[knownRace]];
                            const isSub = itemCode.includes('cc') || itemCode.includes('ac');
                            const option = isSub ? 'subshield' : 'defense';
                            const resolvedRace = similarItem.race === 'all' ? 'all' : knownRace;
                            
                            return {
                                code: itemCode,
                                race: resolvedRace,
                                type: 'shield',
                                option: option,
                                grade: similarItem.grade,
                                uniqueNumber: uniqueNum,
                                shieldNumber: uniqueNum,
                                baseCode: extractBaseCode(itemCode),
                                prefix: prefix,
                                isCustom: true,
                                isConvertible: resolvedRace !== 'all',
                                needsFix: resolvedRace !== 'all' && resolvedRace !== currentPlayerRace,
                                note: similarItem.note || 'Similar shield found',
                                source: 'database-similar'
                            };
                        }
                    }
                }
            }
        }
        
        // ===== 4. WEAPON ANALYSIS =====
        if (prefix === 'iw') {
            const weaponType = itemCode.substring(2, 4);
            const weaponGrade = itemCode[4] || '';
            
            const isStandardWeapon = STANDARD_WEAPON_TYPES.includes(weaponType);
            
            if (isStandardWeapon) {
                return {
                    code: itemCode,
                    race: 'all',
                    type: 'weapon',
                    weaponType: weaponType,
                    grade: weaponGrade,
                    uniqueNumber: extractUniqueNumber(itemCode),
                    baseCode: extractBaseCode(itemCode),
                    prefix: prefix,
                    isCustom: false,
                    isConvertible: false,
                    needsFix: false,
                    note: 'Standard weapon - usable by all races',
                    source: 'standard-weapon'
                };
            }
            
            // All weapons are all-race — tidak perlu konversi race
            return {
                code: itemCode,
                race: 'all',
                type: 'weapon',
                weaponType: weaponType,
                grade: weaponGrade,
                uniqueNumber: extractUniqueNumber(itemCode),
                baseCode: extractBaseCode(itemCode),
                prefix: prefix,
                isCustom: true,
                isConvertible: false,
                needsFix: false,
                note: 'Weapon - usable by all races',
                source: 'standard-weapon'
            };
        }
        
        // ===== 5. DETECT OTHER ITEM TYPES =====
        let itemType = 'non-convertible';
        let itemOption = 'none';
        
        if (prefix === 'ik') {
            itemType = 'cloak';
            itemOption = itemCode.includes('x') ? 'defense' : 'avoid';
        } else if (prefix === 'id') {
            itemType = 'shield';
            itemOption = itemCode.includes('cc') || itemCode.includes('ac') ? 'subshield' : 'defense';
        } else if (prefix === 'ii') {
            itemType = 'ring';
            itemOption = itemCode.includes('x') ? 'defense' : 'avoid';
        } else if (prefix === 'ia') {
            itemType = 'amulet';
            itemOption = itemCode.includes('x') ? 'defense' : 'avoid';
        }
        
        const convertibleTypes = ['cloak', 'shield', 'ring', 'amulet', 'armor'];
        const isConvertible = convertibleTypes.includes(itemType);
        const race = detectItemRace(itemCode);
        
        return {
            code: itemCode,
            race: race,
            type: itemType,
            option: itemOption,
            grade: '',
            uniqueNumber: extractUniqueNumber(itemCode),
            baseCode: extractBaseCode(itemCode),
            prefix: prefix,
            isCustom: false,
            isConvertible: isConvertible,
            needsFix: isConvertible && race !== 'all' && race !== currentPlayerRace,
            needsType: false,
            source: 'pattern-detection'
        };
    }

    // ==================== CONVERSION LAYER (UPDATED FOR COUNCIL ARMOR) ====================
    function convertRace(itemCode, targetRace) {
        const analysis = analyzeItem(itemCode);
        
        if (!analysis || !analysis.isConvertible) {
            // Special case: 'bc' items CAN be converted to Accretia
            if (analysis && analysis.race === 'bc' && targetRace === 'a') {
log(`🔧 Converting B=C item to Accretia: ${itemCode}`);
                // Continue to conversion logic below
            } else {
log(`❌ Not convertible: ${itemCode}`, analysis);
                return itemCode;
            }
        }
        
        if (analysis.race === targetRace || analysis.race === 'all') {
            log(`✅ Already correct race: ${itemCode}`);
            return itemCode;
        }

        // If item not in database (grade kosong & source pattern-detection),
        // don't convert — code unknown, no valid match
        if (!analysis.grade && analysis.source === 'pattern-detection') {
            log(`⚠️ Skipping unknown item (not in DB): ${itemCode}`);
            return itemCode;
        }
        
        log(`🔧 Converting: ${itemCode} (${analysis.race} → ${targetRace})`);
        
        // ===== 1. DATABASE FIRST =====
        if (itemDatabase && analysis.grade) {
            const typeKey = `${analysis.type}|${analysis.option}|${targetRace}|${analysis.grade}`;
            const matchingCodes = itemDatabase.byTypeRaceOptionGrade[typeKey] || [];
            
if (matchingCodes.length > 0) {
                if (analysis.uniqueNumber) {
                    const exactMatch = matchingCodes.find(code => {
                        const dbItem = itemDatabase.byCode[code];
                        return dbItem && dbItem.uniqueNumber === analysis.uniqueNumber;
                    });
                    
                    if (exactMatch) {
                        log(`✅ DB exact match: ${itemCode} → ${exactMatch}`);
                        return exactMatch;
                    }
                }
                
                const firstMatch = matchingCodes[0];
                log(`✅ DB match: ${itemCode} → ${firstMatch}`);
                return firstMatch;
            }
        }
        
        // ===== 2. UNIQUE NUMBER MATCH =====
        if (itemDatabase && analysis.uniqueNumber) {
            const uniqueKey = `${analysis.type}|${analysis.option}|${analysis.uniqueNumber}`;
            const sameUniqueItems = itemDatabase.uniqueNumberMap[uniqueKey];
            
            if (sameUniqueItems && sameUniqueItems[targetRace]) {
                const targetCode = sameUniqueItems[targetRace];
                log(`✅ DB unique match: ${itemCode} → ${targetCode}`);
                return targetCode;
            }
        }
        
        // ===== 3. BASE CODE MATCH =====
        if (itemDatabase && analysis.baseCode) {
            const raceMapping = itemDatabase.byBaseCode[analysis.baseCode];
            if (raceMapping && raceMapping[targetRace]) {
                log(`✅ DB base match: ${itemCode} → ${raceMapping[targetRace]}`);
                return raceMapping[targetRace];
            }
        }
        
        // ===== 4. ARMOR CONVERSIONS (PATTERN BASED) =====
        if (analysis.type === 'armor') {
            const prefix = analysis.prefix;
            const uniqueNum = analysis.uniqueNumber;
            
            if (analysis.isCouncil) {
                // COUNCIL ARMOR: iubcw55 → iuacw55
                const classType = analysis.option;
                const newCode = prefix + targetRace + 'c' + classType + uniqueNum;
                log(`🛡️ Council race change: ${itemCode} → ${newCode}`);
                return newCode;
            } else {
                // STANDARD ARMOR: iubwb55 → iuawb55
                const classType = analysis.option;
                const newCode = prefix + targetRace + classType + uniqueNum;
                log(`🛡️ Standard race change: ${itemCode} → ${newCode}`);
                return newCode;
            }
        }
        
        
        // ===== 5b. WEAPON DARI DATABASE =====
        if (analysis.type === 'weapon' && itemDatabase) {
            // Cari weapon dengan grade + option yang sama untuk target race
            if (analysis.grade) {
                const typeKey = `weapon|${analysis.option || 'injurer'}|${targetRace}|${analysis.grade}`;
                const matchingCodes = itemDatabase.byTypeRaceOptionGrade[typeKey] || [];
                if (matchingCodes.length > 0) {
                    log(`✅ DB weapon race match: ${itemCode} → ${matchingCodes[0]}`);
                    return matchingCodes[0];
                }
            }
            // Fallback: uniqueNumber match
            if (analysis.uniqueNumber) {
                const uniqueKey = `weapon|${analysis.option || 'injurer'}|${analysis.uniqueNumber}`;
                const sameUniqueItems = itemDatabase.uniqueNumberMap[uniqueKey];
                if (sameUniqueItems && sameUniqueItems[targetRace]) {
                    log(`✅ DB weapon unique match: ${itemCode} → ${sameUniqueItems[targetRace]}`);
                    return sameUniqueItems[targetRace];
                }
            }
        }

        // ===== 6. SHIELD CONVERSIONS =====
        if (analysis.type === 'shield' && analysis.uniqueNumber) {
            const shieldKey = `${analysis.option}|${analysis.uniqueNumber}`;
            const targetMapping = itemDatabase?.shieldOptionMap[shieldKey];
            
            if (targetMapping && targetMapping[targetRace]) {
                log(`✅ DB shield mapping: ${itemCode} → ${targetMapping[targetRace]}`);
                return targetMapping[targetRace];
            }
            
            // Pattern fallback for shields
            const isSubShield = analysis.option === 'subshield';
            const typeChar = isSubShield ? 'c' : 'b';
            const uniqueNum = analysis.uniqueNumber || '70';
            const raceCode = targetRace === 'a' ? 'aa' : 'bc';
            
            return `id${raceCode}${typeChar}${uniqueNum}`;
        }
        
        // ===== 7. OTHER ITEM TYPES =====
        if (analysis.type === 'cloak' && itemCode.length === 7) {
            const isDefense = analysis.option === 'defense';
            const typeChar = isDefense ? 'x' : 'y';
            const uniqueNum = analysis.uniqueNumber || '01';
            
            let racePrefix;
            if (targetRace === 'a') racePrefix = 'at';
            else if (targetRace === 'b') racePrefix = 'bt';
            else racePrefix = 'ct';
            
            return `ik${racePrefix}${typeChar}${uniqueNum}`;
        }
        
        if (analysis.type === 'ring' && itemCode.length === 7) {
            const isDefense = analysis.option === 'defense';
            const typeChar = isDefense ? 'x' : 'y';
            const uniqueNum = analysis.uniqueNumber || '01';
            
            return `ii${targetRace}${isDefense ? 'bx' : 'by'}${uniqueNum}`;
        }
        
        if (analysis.type === 'amulet' && itemCode.length === 7) {
            const isDefense = analysis.option === 'defense';
            const typeChar = isDefense ? 'x' : 'y';
            const uniqueNum = analysis.uniqueNumber || '01';
            
            return `ia${targetRace}${isDefense ? 'bx' : 'by'}${uniqueNum}`;
        }
        
        log(`⚠️ No conversion found: ${itemCode}`);
        return itemCode;
    }

    function convertArmorType(itemCode, newType) {
        const analysis = analyzeItem(itemCode);
        const ARMOR_SUBTYPES = ['armor','helmet','upper','lower','gauntlet','shoes'];
        
        if (!analysis || !analysis.needsType || !['w', 'r', 'f'].includes(newType)) {
            return itemCode;
        }

        if (!ARMOR_SUBTYPES.includes(analysis.type)) {
            return itemCode;
        }

        // Kalau sudah tipe yang sama, tidak perlu ubah
        const optionMap = { w: 'warrior', r: 'ranger', f: 'force' };
        const reverseMap = { warrior: 'w', ranger: 'r', force: 'f' };
        const currentOption = reverseMap[analysis.option] || analysis.option;
        if (currentOption === newType) {
            return itemCode;
        }

        // ===== DB LOOKUP DULU =====
        // Cari item yang: type sama, option=newType, race sama, grade sama
        if (itemDatabase && analysis.grade) {
            const targetOption = optionMap[newType]; // 'warrior'/'ranger'/'force'
            const raceToUse = analysis.race === 'all' ? 'all' : (analysis.race || currentPlayerRace);

            // Coba dengan race item
            const typeKey = `${analysis.type}|${targetOption}|${raceToUse}|${analysis.grade}`;
            const matches = itemDatabase.byTypeRaceOptionGrade[typeKey] || [];
            log(`🔍 DB lookup: key='${typeKey}', matches=${matches.length}`);
            if (matches.length > 0) {
                log(`✅ DB armor type match: ${itemCode} → ${matches[0]}`);
                return matches[0];
            }

            // Fallback: coba semua race kalau all-race
            if (raceToUse !== currentPlayerRace) {
                const typeKey2 = `${analysis.type}|${targetOption}|${currentPlayerRace}|${analysis.grade}`;
                const matches2 = itemDatabase.byTypeRaceOptionGrade[typeKey2] || [];
                if (matches2.length > 0) {
                    log(`✅ DB armor type fallback: ${itemCode} → ${matches2[0]}`);
                    return matches2[0];
                }
            }
        }

        // ===== PATTERN FALLBACK =====
        // For items not in DB or DB lookup failed
        const prefix = analysis.prefix;
        const race = analysis.race !== 'all' ? analysis.race : currentPlayerRace;
        const uniqueNum = analysis.uniqueNumber;

        if (analysis.isCouncil) {
            const newCode = prefix + race + 'c' + newType + uniqueNum;
            log(`⚔️ Council class change: ${itemCode} → ${newCode}`);
            return newCode;
        } else {
            const newCode = prefix + race + newType + uniqueNum;
            log(`⚔️ Standard class change: ${itemCode} → ${newCode}`);
            return newCode;
        }
    }

    function convertAccessoryType(itemCode, targetType) {
        const analysis = analyzeItem(itemCode);
        
        if (!analysis || !['ring', 'amulet'].includes(analysis.type) || !['defense', 'avoid'].includes(targetType)) {
            log(`❌ Not convertible accessory: ${itemCode}`);
            return itemCode;
        }

        // If not in database (empty grade = unknown), cannot convert type
        if (!analysis.grade) {
            return { code: itemCode, failed: true, reason: 'not in database' };
        }

        // If option already the same, no need to change
        if (analysis.option === targetType) {
            return itemCode;
        }
        
        log(`🔍 Converting ${analysis.type}: ${itemCode} (${analysis.option} → ${targetType})`);
        
        if (itemDatabase && analysis.grade) {
            // Coba dengan race player dulu, fallback ke 'all' untuk item all-race (3D, dll)
            const raceToTry = analysis.race === 'all' ? 'all' : (currentPlayerRace || analysis.race);
            const typeKey = `${analysis.type}|${targetType}|${raceToTry}|${analysis.grade}`;
            const matchingCodes = itemDatabase.byTypeRaceOptionGrade[typeKey] || [];
            
            if (matchingCodes.length > 0) {
                if (analysis.uniqueNumber) {
                    const exactMatch = matchingCodes.find(code => {
                        const dbItem = itemDatabase.byCode[code];
                        return dbItem && dbItem.uniqueNumber === analysis.uniqueNumber;
                    });
                    
                    if (exactMatch) {
                        log(`✅ DB ${analysis.type} match: ${itemCode} → ${exactMatch}`);
                        return exactMatch;
                    }
                }
                
                log(`✅ DB ${analysis.type} match: ${itemCode} → ${matchingCodes[0]}`);
                return matchingCodes[0];
            }

            // Kalau masih tidak ketemu, coba kedua race (player + 'all')
            const fallbackRace = raceToTry === 'all' ? currentPlayerRace : 'all';
            if (fallbackRace) {
                const fallbackKey = `${analysis.type}|${targetType}|${fallbackRace}|${analysis.grade}`;
                const fallbackCodes = itemDatabase.byTypeRaceOptionGrade[fallbackKey] || [];
                if (fallbackCodes.length > 0) {
                    log(`✅ DB ${analysis.type} fallback match: ${itemCode} → ${fallbackCodes[0]}`);
                    return fallbackCodes[0];
                }
            }
        }
        
        // Pattern fallback — hanya untuk item race-specific biasa
        if (analysis.uniqueNumber && analysis.race !== 'all') {
            const race = currentPlayerRace || analysis.race;
            const uniqueNum = analysis.uniqueNumber;
            
            let newCode;
            if (analysis.type === 'ring') {
                const middleChars = targetType === 'defense' ? 'bx' : 'by';
                newCode = `ii${race}${middleChars}${uniqueNum}`;
            } else {
                const middleChars = targetType === 'defense' ? 'bx' : 'by';
                newCode = `ia${race}${middleChars}${uniqueNum}`;
            }
            
            log(`⚡ Pattern ${analysis.type} conversion: ${itemCode} → ${newCode}`);
            return newCode;
        }
        
        return itemCode;
    }

    function convertCloakType(itemCode, targetType) {
        const analysis = analyzeItem(itemCode);
        
        if (!analysis || analysis.type !== 'cloak') {
            return itemCode;
        }

        const dbTargetType = targetType === 'cloak-defense' ? 'defense' : 'avoid';

        // If not in database, cannot convert type
        if (!analysis.grade) {
            return { code: itemCode, failed: true, reason: 'not in database' };
        }

        // If option already the same, no need to change
        if (analysis.option === dbTargetType) {
            return itemCode;
        }
        
        if (itemDatabase && analysis.grade) {
            // Try all race combinations: item race → player race → 'all'
            const racesToTry = [];
            if (analysis.race && analysis.race !== 'all') racesToTry.push(analysis.race);
            if (currentPlayerRace && currentPlayerRace !== analysis.race) racesToTry.push(currentPlayerRace);
            if (!racesToTry.includes('all')) racesToTry.push('all');

            for (const raceToTry of racesToTry) {
                const typeKey = `cloak|${dbTargetType}|${raceToTry}|${analysis.grade}`;
                const matchingCodes = itemDatabase.byTypeRaceOptionGrade[typeKey] || [];
                if (matchingCodes.length > 0) {
                    log(`✅ DB cloak match [${raceToTry}]: ${itemCode} → ${matchingCodes[0]}`);
                    return matchingCodes[0];
                }
            }
        }
        
        if (analysis.uniqueNumber && analysis.race !== 'all') {
            const race = currentPlayerRace || analysis.race;
            const uniqueNum = analysis.uniqueNumber;
            const typeChar = dbTargetType === 'defense' ? 'x' : 'y';
            const racePrefix = race === 'a' ? 'at' : race === 'b' ? 'bt' : 'ct';
            
            return `ik${racePrefix}${typeChar}${uniqueNum}`;
        }
        
        return itemCode;
    }

    function convertShieldType(itemCode, targetType) {
        const analysis = analyzeItem(itemCode);
        
        if (!analysis || analysis.type !== 'shield') {
            log(`❌ Not a shield: ${itemCode}`);
            return itemCode;
        }
        
        // If not in database, cannot convert type
        if (!analysis.grade) {
            return { code: itemCode, failed: true, reason: 'not in database' };
        }

        const normalizedTarget = targetType === 'subshield' ? 'subshield' : 'defense';
        
        if (analysis.option === normalizedTarget) {
            log(`✅ Shield already ${normalizedTarget}: ${itemCode}`);
            return itemCode;
        }
        
        log(`🔧 Converting shield: ${itemCode} (${analysis.option} → ${normalizedTarget})`);
        
        if (itemDatabase && currentPlayerRace && analysis.uniqueNumber) {
            const shieldKey = `${normalizedTarget}|${analysis.uniqueNumber}`;
            const targetMapping = itemDatabase.shieldOptionMap[shieldKey];
            
            if (targetMapping && targetMapping[currentPlayerRace]) {
                log(`✅ DB shield mapping: ${itemCode} → ${targetMapping[currentPlayerRace]}`);
                return targetMapping[currentPlayerRace];
            }
        }
        
        if (analysis.uniqueNumber) {
            const race = currentPlayerRace || analysis.race;
            const uniqueNum = analysis.uniqueNumber;
            const typeChar = normalizedTarget === 'defense' ? 'b' : 'c';
            const raceCode = race === 'a' ? 'aa' : 'bc';
            
            return `id${raceCode}${typeChar}${uniqueNum}`;
        }
        
        log(`⚠️ No shield conversion found: ${itemCode}`);
        return itemCode;
    }

    // ==================== SCANNING LAYER ====================
    function scanPlayerItems() {
        const results = [];
        const itemInputs = document.querySelectorAll('input[name^="item_code"]');
        
        itemInputs.forEach((input) => {
            try {
                if (input.type === 'hidden') return;
                if (input.classList && (input.classList.contains('select2-offscreen') || input.classList.contains('item_code_ajax'))) return;
                if (input.offsetParent === null && (!input.getClientRects || input.getClientRects().length === 0)) return;
                
                const name = (input.name || '').trim();
                const code = (input.value || '').trim().toLowerCase();
                
                if (!code || code === 'none' || code.trim() === '') return;
                
                const qtyInput = document.querySelector(`input[name="item_qty${name.replace('item_code', '')}"]`) || 
                               document.querySelector(`input[name="item_amount${name.replace('item_code', '')}"]`);
                const qty = qtyInput ? (qtyInput.value || '1') : '1';
                
                const analysis = analyzeItem(code);
                
results.push({
                    input,
                    code,
                    qty,
                    idx: name.replace('item_code', ''),
                    analysis: analysis,
                    isValid: analysis ? analysis.isConvertible : false,
                    currentRace: analysis ? analysis.race : null,
                    needsFix: analysis ? analysis.needsFix : false
                });
            } catch (e) {}
        });

        // Extra selectors
        const extraSelectors = ['#porm > table > tbody > tr:nth-child(40) > td:nth-child(2) > input'];
        extraSelectors.forEach(sel => {
            try {
                const el = document.querySelector(sel);
                if (el && el.tagName === 'INPUT') {
                    if (el.type === 'hidden') return;
                    if (el.classList && (el.classList.contains('select2-offscreen') || el.classList.contains('item_code_ajax'))) return;
                    if (el.offsetParent === null && (!el.getClientRects || el.getClientRects().length === 0)) return;
                    
                    const code = (el.value || '').trim().toLowerCase();
                    if (!code || code === 'none' || code.trim() === '') return;
                    
                    if (!results.some(r => r.input === el)) {
                        const name = (el.name || '').trim() || 'item_code_extra';
                        const analysis = analyzeItem(code);
                        
                        results.push({
                            input: el,
                            code,
                            qty: '1',
                            idx: name.replace('item_code', ''),
                            analysis: analysis,
                            isValid: analysis ? analysis.isConvertible : false,
                            currentRace: analysis ? analysis.race : null,
                            needsFix: analysis ? analysis.needsFix : false
                        });
                    }
                }
            } catch (e) {}
        });

        // ==================== NEW VERSION (Select2) SUPPORT ====================
        // Di New Version, item code disimpan di <input type="hidden" class="select2-offscreen" name="item_codeX">
        // Yang ditampilkan di UI adalah <span class="select2-chosen"> di dalam container #s2id_item_codeX
        // Kita baca dari hidden input langsung (nilainya sudah benar), lalu gunakan span sebagai display label.
        const select2HiddenInputs = document.querySelectorAll('input[type="hidden"][name^="item_code"].select2-offscreen, input[type="hidden"][name^="item_code"].item_code_ajax');
        select2HiddenInputs.forEach((input) => {
            try {
                const name = (input.name || '').trim();
                const code = (input.value || '').trim().toLowerCase();

                if (!code || code === 'none' || code.trim() === '') return;

                // Hindari duplikasi — skip jika sudah ada di results
                if (results.some(r => r.input === input)) return;

                // Coba baca label dari span Select2 untuk display info (opsional)
                const idx = name.replace('item_code', '');
                const select2ContainerId = `s2id_item_code${idx}`;
                const labelSpan = document.querySelector(`#${select2ContainerId} a span.select2-chosen`);
                const displayLabel = labelSpan ? labelSpan.textContent.trim() : code;

                // Ambil qty dari input qty/amount yang bersesuaian
                const qtyInput = document.querySelector(`input[name="item_qty${idx}"]`) ||
                                 document.querySelector(`input[name="item_amount${idx}"]`);
                const qty = qtyInput ? (qtyInput.value || '1') : '1';

                const analysis = analyzeItem(code);

                results.push({
                    input,
                    code,
                    qty,
                    idx,
                    displayLabel, // label lengkap dari Select2 span (ex: "iynew90 - Warden Weapon Coupon")
                    isNewVersion: true,
                    analysis: analysis,
                    isValid: analysis ? analysis.isConvertible : false,
                    currentRace: analysis ? analysis.race : null,
                    needsFix: analysis ? analysis.needsFix : false
                });
            } catch (e) {}
        });
        
        return results;
    }

    // ==================== UI LAYER ====================
    function updateRaceDisplay() {
        const raceDisplay = document.getElementById('raceDisplay');
        const playerInfo = detectPlayerInfo();
        const race = raceData[playerInfo.race];
        
        if (playerInfo.nickname && race) {
            raceDisplay.innerHTML = 
                `<span style="color:${getRaceColor(playerInfo.race)}; font-weight: bold;">
                    ${escapeHtml(playerInfo.nickname)}
                </span> : ${race.name.toUpperCase()}`;
            
            raceDisplay.className = `race-display`;
            currentPlayerRace = playerInfo.race;
            currentPlayerNickname = playerInfo.nickname;
            
        } else if (race) {
            raceDisplay.innerHTML = `${race.name.toUpperCase()}`;
            raceDisplay.className = `race-display`;
            currentPlayerRace = playerInfo.race;
            
        } else {
            raceDisplay.innerHTML = 'NOT DETECTED';
            raceDisplay.className = 'race-display';
            currentPlayerRace = null;
            currentPlayerNickname = null;
        }
    }

    function createScannedItemElement(item) {
        const div = document.createElement('div');
        div.className = 'clickable-item';
        
        const analysis = item.analysis;
        
        // Add armor/weapon specific CSS classes
        if (analysis) {
            if (analysis.type === 'weapon') {
                if (analysis.race === 'all') {
                    div.classList.add('weapon-standard');
                } else if (analysis.isCustom) {
                    div.classList.add('weapon-custom');
                } else {
                    div.classList.add('weapon-unknown');
                }
            } else if (analysis.type === 'armor') {
                if (analysis.isCouncil) {
                    div.classList.add('armor-council');
                } else {
                    div.classList.add('armor-standard');
                }
            }
        }
        
        const raceInfo = raceData[item.currentRace] || { badge: 'race-unknown', name: '?' };
        const safeCode = escapeHtml(item.code || '(empty)');
        
        // Get grade display
        const grade = analysis?.grade;
        const gradeDisplay = grade ? `<span class="type-badge" style="background:#9b59b6">${grade.toUpperCase()}</span>` : '';

        // Weapon type badge — cek juga di weaponDatabase untuk nama/note
        let weaponNote = analysis?.note || '';
        let weaponDbGrade = '';
        if (analysis?.type === 'weapon' && weaponDatabase?.byCode[item.code]) {
            const wdb = weaponDatabase.byCode[item.code];
            weaponNote = wdb.note || weaponNote;
            weaponDbGrade = wdb.grade;
        }
        const weaponClickHint = analysis?.type === 'weapon'
            ? `<span style="font-size:10px;color:#5865F2;margin-left:4px;">⚔️ klik untuk ganti</span>`
            : '';

        const weaponTypeBadge = analysis?.type === 'weapon' && analysis.race === 'all' 
            ? `<span class="type-badge" style="background:#27ae60">STANDARD</span>` 
            : '';

        // Council armor badge
        const councilBadge = analysis?.isCouncil 
            ? `<span class="type-badge" style="background:#e67e22">COUNCIL</span>` 
            : '';

        // Source badge
        let sourceBadge = '';
        if (analysis?.source) {
            let sourceColor = '#3498db';
            let sourceText = analysis.source.charAt(0).toUpperCase();
            
            if (analysis.source.includes('database')) {
                sourceColor = '#9b59b6';
                sourceText = 'DB';
            } else if (analysis.source.includes('standard')) {
                sourceColor = '#27ae60';
                sourceText = 'STD';
            } else if (analysis.source.includes('council')) {
                sourceColor = '#e67e22';
                sourceText = 'CNCL';
            }
            
            sourceBadge = `<span class="type-badge" style="background:${sourceColor}">${sourceText}</span>`;
        }

        div.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    ${sourceBadge}
                    <strong>${safeCode}</strong>
                    ${councilBadge}
                    ${weaponTypeBadge}
                    ${analysis?.option ? `<span class="type-badge" style="background:${getOptionColor(analysis.option)}">${escapeHtml(analysis.option.toUpperCase())}</span>` : ''}
                    ${gradeDisplay}
                    <span class="race-badge ${raceInfo.badge}" title="${raceInfo.name}">
                        ${item.currentRace ? item.currentRace.toUpperCase() : '?'}
                    </span>
                    ${weaponClickHint}
                </div>
                <div class="scanned-controls">
                    <button class="control-btn small" title="Focus">🔎</button>
                </div>
            </div>
            ${(weaponNote || analysis?.note) ? `<div style="font-size:11px;color:#b5bac1;margin-top:4px;">${escapeHtml(weaponNote || analysis?.note)}</div>` : ''}
            ${(analysis?.grade || weaponDbGrade) ? `<div style="font-size:10px;color:#72767d;margin-top:2px;">Grade: ${escapeHtml(weaponDbGrade || analysis.grade)}</div>` : ''}
        `;

        const btn = div.querySelector('.control-btn.small');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                focusOnItem(item.input);
            });
        }

        div.addEventListener('click', () => {
            const codeToCheck = item.code;
            const liveAnalysis = analyzeItem(codeToCheck) || analysis;
            if (liveAnalysis?.type === 'weapon') {
                const liveItem = { ...item, code: codeToCheck, analysis: liveAnalysis };
                showWeaponSelector(liveItem);
            } else {
                focusOnItem(item.input);
            }
        });
        return div;
    }

    function getOptionColor(option) {
        const colors = {
            'defense': '#4a90e2', 'avoid': '#f39c12', 'subshield': '#9b59b6',
            'w': '#e74c3c', 'r': '#2ecc71', 'f': '#9b59b6',
            'injurer': '#e74c3c'
        };
        return colors[option] || '#95a5a6';
    }

    function escapeHtml(text) {
        if (!text) return '';
        return String(text).replace(/&/g, '&amp;')
                          .replace(/</g, '&lt;')
                          .replace(/>/g, '&gt;');
    }

    // Untuk New Version (Select2), input adalah hidden — kita cari elemen visible-nya
    function getVisibleElement(inputElement) {
        if (!inputElement) return inputElement;
        const isHidden = inputElement.type === 'hidden' ||
                         (inputElement.classList && (
                             inputElement.classList.contains('select2-offscreen') ||
                             inputElement.classList.contains('item_code_ajax')
                         ));
        if (!isHidden) return inputElement;
        // Cari container Select2: name="item_codeX" -> id="s2id_item_codeX"
        const name = (inputElement.name || '').trim();
        if (name) {
            const s2Container = document.getElementById(`s2id_${name}`);
            if (s2Container) return s2Container;
        }
        return inputElement.closest('tr') || inputElement;
    }

    function focusOnItem(inputElement) {
        if (!inputElement) return;
        try {
            const visibleEl = getVisibleElement(inputElement);
            visibleEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            visibleEl.classList.add('item-highlight');
            if (inputElement.type !== 'hidden') {
                inputElement.focus();
                setTimeout(() => inputElement.select && inputElement.select(), 100);
            }
            setTimeout(() => {
                visibleEl.classList.remove('item-highlight');
                try { inputElement.classList.remove('item-highlight'); } catch(e) {}
            }, 2000);
        } catch (e) {}
    }

    // ==================== RENDERING ====================
    function renderScannedItems(filterText) {
        const container = document.getElementById('itemList');
        container.innerHTML = '';
        
        let items = currentScannedItems.slice();

        // Apply status filter toggle
        if (currentScanFilter === 'mismatch') {
            items = items.filter(i => i.needsFix);
        } else if (currentScanFilter === 'ok') {
            items = items.filter(i => !i.needsFix);
        }
        
        if (filterText) {
            const ft = filterText.toLowerCase();
            items = items.filter(i => 
                (i.code || '').includes(ft) || 
                (i.idx || '').includes(ft) ||
                (i.analysis?.note || '').toLowerCase().includes(ft) ||
                (i.analysis?.grade || '').toLowerCase().includes(ft)
            );
        }
        
        if (items.length === 0) {
            container.innerHTML = '<div class="empty-message">No scanned items found</div>';
            return;
        }
        
        items.forEach((item) => {
            const el = createScannedItemElement(item);
            if (item.needsFix) {
                el.style.borderLeft = '3px solid #faa81a';
                el.title = 'NEEDS FIXING - Race mismatch';
            }
            container.appendChild(el);
        });
    }

    function renderFixedItems() {
        const container = document.getElementById('fixLog');
        container.innerHTML = '';
        
        if (currentFixedItems.length === 0) {
            container.innerHTML = '<div class="empty-message">No fixes applied yet</div>';
            return;
        }
        
        const recent = currentFixedItems.slice(-10).reverse();
        recent.forEach(fix => {
            const div = document.createElement('div');
            div.className = 'clickable-item fixed-item';
            
            const oldRace = fix.oldCode[2] || '?';
            const newRace = fix.newCode[2] || '?';
            
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;">
                    <span class="race-badge ${raceData[oldRace]?.badge || 'race-unknown'}">${oldRace.toUpperCase()}</span>
                    <strong>${escapeHtml(fix.oldCode)}</strong> 
                    <span>→</span>
                    <span class="race-badge ${raceData[newRace]?.badge || 'race-unknown'}">${newRace.toUpperCase()}</span>
                    <strong>${escapeHtml(fix.newCode)}</strong>
                </div>
                <div style="font-size:11px;color:#b5bac1;margin-top:4px;">${fix.timestamp}</div>
            `;
            
            div.addEventListener('click', () => focusOnItem(fix.input));
            container.appendChild(div);
        });
    }

    function renderFailedItems(failedCodes) {
        // Display failed items in fixLog with red border
        const container = document.getElementById('fixLog');
        
        // Add failed section above existing list
        const failSection = document.createElement('div');
        failSection.style.cssText = 'margin-bottom:8px;';
        failSection.innerHTML = `<div style="font-size:11px;color:#ed4245;font-weight:bold;margin-bottom:4px;">⚠️ Gagal dikonversi (${failedCodes.length}):</div>`;
        
        failedCodes.forEach(code => {
            const div = document.createElement('div');
            div.className = 'clickable-item';
            div.style.borderLeft = '3px solid #ed4245';
            div.style.color = '#ed4245';
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:10px;background:rgba(237,66,69,0.2);padding:2px 6px;border-radius:4px;font-weight:bold;">GAGAL</span>
                    <strong>${escapeHtml(code)}</strong>
                    <span style="font-size:11px;color:#b5bac1;">— not in database</span>
                </div>
            `;
            // Klik untuk highlight item di halaman
            const scannedItem = currentScannedItems.find(i => i.code === code);
            if (scannedItem) div.addEventListener('click', () => focusOnItem(scannedItem.input));
            failSection.appendChild(div);
        });
        
        // Insert di atas isi fixLog yang ada
        container.insertBefore(failSection, container.firstChild);
        container.scrollIntoView({ behavior: 'smooth' });
    }

    function updateItemStats() {
        const statsElement = document.getElementById('itemStats');
        const total = currentScannedItems.length;
        const mismatch = currentScannedItems.filter(i => i.needsFix).length;
        const ok = currentScannedItems.filter(i => i.isValid && !i.needsFix).length;
        const fixedCount = currentFixedItems.length;
        
        statsElement.innerHTML = `📊 ${total} item &nbsp;|&nbsp; <span style="color:#f39c12">⚠️ ${mismatch}</span> &nbsp;|&nbsp; <span style="color:#57f287">✅ ${ok}</span> &nbsp;|&nbsp; Fixed: ${fixedCount}`;
    }

    // ==================== ACTION HANDLERS ====================
    document.getElementById('scanBtn').onclick = () => {
        log('=== SCAN CLICKED ===');
        // Reset filter to All on new scan
        rfFilterClick('all');
        currentScannedItems = scanPlayerItems();
        renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
        updateItemStats();
    };

    document.getElementById('fixBtn').onclick = () => {
        log('=== FIX ALL CLICKED ===');
        log('Player race:', currentPlayerRace);
        
        if (!currentPlayerRace) {
            showToast('❌ Race not detected — waiting for auto-detect or reload', 'error');
            return;
        }
        
        if (!itemDatabase) {
            showToast('⚠️ Database not loaded — click Refresh DB', 'warn');
            return;
        }
        
        const validItems = currentScannedItems.filter(i => i.needsFix);
        log('Items to fix:', validItems.length);
        
        if (validItems.length === 0) {
            showToast('✅ All items already match race', 'info');
            return;
        }
        
        let fixedItems = [];
        let successCount = 0;
        let failedItems = [];
        let skippedNotInDb = [];
validItems.forEach(item => {
log('--- Processing Item ---');
            log('Original:', item.code);
            log('Analysis:', item.analysis);
            
            // Weapon selalu all-race (needsFix=false) — otomatis tidak masuk validItems

            // Item not in database — don't convert
            if (!item.analysis?.grade && item.analysis?.source === 'pattern-detection') {
skippedNotInDb.push(item.code);
                return;
            }
            
            const newCode = convertRace(item.code, currentPlayerRace);
log('Converted to:', newCode);

            if (newCode !== item.code) {
                item.input.value = newCode;
                item.input.dispatchEvent(new Event('input', { bubbles: true }));
                item.input.dispatchEvent(new Event('change', { bubbles: true }));
                
                fixedItems.push({
                    input: item.input,
                    oldCode: item.code,
                    newCode: newCode
                });
                
                currentFixedItems.push({
                    input: item.input,
                    oldCode: item.code,
                    newCode: newCode,
                    timestamp: new Date().toLocaleTimeString()
                });
                
                successCount++;
            } else {
                // Conversion returned same code = failed
                failedItems.push(item.code);
            }
        });
        
        // Push to undo stack
        if (fixedItems.length > 0) {
            pushUndo('Fix All', fixedItems);
        }
        
        log(`Results: ${successCount} fixed, ${failedItems.length} failed`);

        currentScannedItems = scanPlayerItems();
        renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
        updateItemStats();
        renderFixedItems();
        
        if (successCount > 0 && failedItems.length === 0 && skippedNotInDb.length === 0) {
            document.getElementById('fixLog').scrollIntoView({ behavior: 'smooth' });
            showToast(`✅ ${successCount} items successfully fixed`, 'success');
        } else if (successCount > 0 && (failedItems.length > 0 || skippedNotInDb.length > 0)) {
            document.getElementById('fixLog').scrollIntoView({ behavior: 'smooth' });
            const notDbCount = failedItems.length + skippedNotInDb.length;
            showToast(`✅ ${successCount} fixed, ⚠️ ${notDbCount} not in database`, 'warn', 3500);
            renderFailedItems([...failedItems, ...skippedNotInDb]);
        } else if (successCount === 0 && (failedItems.length > 0 || skippedNotInDb.length > 0)) {
            const notDbCount = failedItems.length + skippedNotInDb.length;
            showToast(`⚠️ ${notDbCount} items not in database`, 'warn', 3500);
            renderFailedItems([...failedItems, ...skippedNotInDb]);
        }
    };

    // ==================== UNDO/REDO SYSTEM ====================
    function pushUndo(actionName, items) {
        if (items.length === 0) return;
        
        undoStack.push({
            action: actionName,
            items: items.map(item => ({
                input: item.input,
                oldCode: item.oldCode,
                newCode: item.newCode
            })),
            timestamp: Date.now()
        });
        
        if (undoStack.length > MAX_HISTORY) {
            undoStack.shift(); // remove oldest
        }
        
        redoStack = []; // clear redo stack on new action
        updateUndoButtons();
    }

    function updateUndoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        const historyCount = document.getElementById('historyCount');
        
        undoBtn.disabled = undoStack.length === 0;
        redoBtn.disabled = redoStack.length === 0;
        historyCount.textContent = `${undoStack.length}/${MAX_HISTORY}`;
        
        // Update button tooltips
        if (undoStack.length > 0) {
            const last = undoStack[undoStack.length - 1];
            undoBtn.title = `Undo: ${last.action} (${last.items.length} items)`;
        } else {
            undoBtn.title = 'No actions to undo';
        }
        
        if (redoStack.length > 0) {
            const last = redoStack[redoStack.length - 1];
            redoBtn.title = `Redo: ${last.action} (${last.items.length} items)`;
        } else {
            redoBtn.title = 'No actions to redo';
        }
    }

    // ==================== ACTION HANDLERS ====================
    document.getElementById('undoBtn').onclick = () => {
        if (undoStack.length === 0) {
            showToast('No actions to undo', 'info');
            return;
        }
        
        const action = undoStack.pop();
        
        // Revert changes
        action.items.forEach(item => {
            item.input.value = item.oldCode;
            item.input.dispatchEvent(new Event('input', { bubbles: true }));
            item.input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        // Move to redo stack
        redoStack.push(action);
        
        // Update UI
        currentScannedItems = scanPlayerItems();
        renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
        updateItemStats();
        updateUndoButtons();
        
        showToast(`↶ Undone: ${action.action} (${action.items.length} items)`, 'success');
    };

    // Redo handler
    document.getElementById('redoBtn').onclick = () => {
        if (redoStack.length === 0) {
            showToast('No actions to redo', 'info');
            return;
        }
        
        const action = redoStack.pop();
        
        // Re-apply changes
        action.items.forEach(item => {
            item.input.value = item.newCode;
            item.input.dispatchEvent(new Event('input', { bubbles: true }));
            item.input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        // Move back to undo stack
        undoStack.push(action);
        
        // Update UI
        currentScannedItems = scanPlayerItems();
        renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
        updateItemStats();
        updateUndoButtons();
        
        showToast(`↷ Redone: ${action.action} (${action.items.length} items)`, 'success');
    };

    // Armor type buttons — fix tipe DAN race sekaligus
    document.querySelectorAll('.armor-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const newType = this.getAttribute('data-type');
            if (!currentPlayerRace) return showToast('❌ Race not detected', 'error');
            
            const armorItems = currentScannedItems.filter(i => 
                i.isValid && i.analysis && i.analysis.needsType);
            
            if (armorItems.length === 0) return showToast('No armor items found', 'warn');
            
            let typeChanged = 0;
            let raceFixed = 0;
            let failedArmor = [];
            let armorChanges = [];

            armorItems.forEach(item => {
                const oldCode = item.code;

                // Step 1: ubah tipe armor (w/r/f)
                let code = convertArmorType(oldCode, newType);

                // Step 2: fix race juga kalau masih salah
                const analysisAfterType = analyzeItem(code);
                if (analysisAfterType && analysisAfterType.race !== currentPlayerRace && analysisAfterType.race !== 'all') {
                    const raceCode = convertRace(code, currentPlayerRace);
                    if (raceCode !== code) {
                        code = raceCode;
                        raceFixed++;
                    }
                }

                if (code !== oldCode) {
                    item.input.value = code;
                    item.input.dispatchEvent(new Event('input', { bubbles: true }));
                    item.input.dispatchEvent(new Event('change', { bubbles: true }));
                    typeChanged++;

                    armorChanges.push({
                        input: item.input,
                        oldCode: oldCode,
                        newCode: code
                    });

                    currentFixedItems.push({
                        input: item.input,
                        oldCode: oldCode,
                        newCode: code,
                        timestamp: new Date().toLocaleTimeString()
                    });
                } else {
                    failedArmor.push(oldCode);
                }
            });
            
            if (typeChanged > 0) {
                pushUndo(`Armor → ${newType === 'w' ? 'Warrior' : newType === 'r' ? 'Ranger' : 'Force'}`, armorChanges);
                const typeLabel = newType === 'w' ? 'Warrior' : newType === 'r' ? 'Ranger' : 'Force';
                const raceNote = raceFixed > 0 ? ` + ${raceFixed} race fix` : '';
                showToast(`✅ ${typeChanged} armor → ${typeLabel}${raceNote}`, 'success');
                currentScannedItems = scanPlayerItems();
                renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
                updateItemStats();
                renderFixedItems();
            }
            if (failedArmor.length > 0) {
                showToast(`⚠️ ${failedArmor.length} armor items cannot be converted`, 'warn', 3500);
                renderFailedItems(failedArmor);
            }
        });
    });

    // Accessory type buttons
    document.querySelectorAll('.accessory-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetType = this.getAttribute('data-type');
            if (!currentPlayerRace) return showToast('❌ Race not detected', 'error');
            
            // Filter by type saja — isValid hanya untuk ganti race, bukan ganti tipe
            const accessoryItems = currentScannedItems.filter(i => 
                i.analysis && 
                (i.analysis.type === 'ring' || i.analysis.type === 'amulet'));
            
            if (accessoryItems.length === 0) return showToast('No accessory items found', 'warn');
            
            let changed = 0;
            let notInDb = [];
            let accessoryChanges = [];
            accessoryItems.forEach(item => {
                const oldCode = item.code;
                const result = convertAccessoryType(oldCode, targetType);
                if (result && typeof result === 'object' && result.failed) {
                    notInDb.push(oldCode);
                    return;
                }
                const newCode = result;
                if (newCode !== oldCode) {
                    accessoryChanges.push({input: item.input, oldCode: oldCode, newCode: newCode});
                    item.input.value = newCode;
                    item.input.dispatchEvent(new Event('input', { bubbles: true }));
                    item.input.dispatchEvent(new Event('change', { bubbles: true }));
                    changed++;
                    
                    currentFixedItems.push({
                        input: item.input,
                        oldCode: oldCode,
                        newCode: newCode,
                        timestamp: new Date().toLocaleTimeString()
                    });
                }
            });
            
            if (notInDb.length > 0) {
                showToast(`⚠️ ${notInDb.length} items not in database`, 'warn', 3500);
                renderFailedItems(notInDb);
            }
            if (changed > 0) {
                pushUndo(`Accessory → ${targetType.toUpperCase()}`, accessoryChanges);
                showToast(`✅ ${changed} accessory changed to ${targetType.toUpperCase()}`, 'success');
                currentScannedItems = scanPlayerItems();
                renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
                updateItemStats();
                renderFixedItems();
            }
        });
    });

    // Cloak type buttons
    document.querySelectorAll('.cloak-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetType = this.getAttribute('data-type');
            if (!currentPlayerRace) return showToast('❌ Race not detected', 'error');
            
            // Filter by type saja — isValid hanya untuk ganti race, bukan ganti tipe
            const cloakItems = currentScannedItems.filter(i => 
                i.analysis && i.analysis.type === 'cloak');
            
            if (cloakItems.length === 0) return showToast('No cloak items found', 'warn');
            
            let changed = 0;
            let cloakNotInDb = [];
            let cloakChanges = [];
            cloakItems.forEach(item => {
                const oldCode = item.code;
                const result = convertCloakType(oldCode, targetType);
                if (result && typeof result === 'object' && result.failed) {
                    cloakNotInDb.push(oldCode);
                    return;
                }
                const newCode = result;
                if (newCode !== oldCode) {
                    cloakChanges.push({input: item.input, oldCode: oldCode, newCode: newCode});
                    item.input.value = newCode;
                    item.input.dispatchEvent(new Event('input', { bubbles: true }));
                    item.input.dispatchEvent(new Event('change', { bubbles: true }));
                    changed++;
                    
                    currentFixedItems.push({
                        input: item.input,
                        oldCode: oldCode,
                        newCode: newCode,
                        timestamp: new Date().toLocaleTimeString()
                    });
                }
            });
            
            if (cloakChanges.length > 0) {
                pushUndo(`Cloak → ${targetType === 'cloak-defense' ? 'DEFENSE' : 'AVOID'}`, cloakChanges);
            }
            if (cloakNotInDb.length > 0) {
                showToast(`⚠️ ${cloakNotInDb.length} cloaks not in database`, 'warn', 3500);
                renderFailedItems(cloakNotInDb);
            }
            if (changed > 0) {
                showToast(`✅ ${changed} cloaks changed to ${targetType === 'cloak-defense' ? 'DEFENSE' : 'AVOID'}`, 'success');
                currentScannedItems = scanPlayerItems();
                renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
                updateItemStats();
                renderFixedItems();
            }
        });
    });

    // Shield type buttons
    document.querySelectorAll('.shield-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetType = this.getAttribute('data-type');
            if (!currentPlayerRace) return showToast('❌ Race not detected', 'error');
            
            // Filter by type saja — isValid hanya untuk ganti race, bukan ganti tipe
            const shieldItems = currentScannedItems.filter(i => 
                i.analysis && i.analysis.type === 'shield');
            
            if (shieldItems.length === 0) return showToast('No shield items found', 'warn');
            
            let changed = 0;
            let shieldNotInDb = [];
            let shieldChanges = [];
            shieldItems.forEach(item => {
                const oldCode = item.code;
                const result = convertShieldType(oldCode, targetType);
                if (result && typeof result === 'object' && result.failed) {
                    shieldNotInDb.push(oldCode);
                    return;
                }
                const newCode = result;
                if (newCode !== oldCode) {
                    shieldChanges.push({input: item.input, oldCode: oldCode, newCode: newCode});
                    item.input.value = newCode;
                    item.input.dispatchEvent(new Event('input', { bubbles: true }));
                    item.input.dispatchEvent(new Event('change', { bubbles: true }));
                    changed++;
                    
                    currentFixedItems.push({
                        input: item.input,
                        oldCode: oldCode,
                        newCode: newCode,
                        timestamp: new Date().toLocaleTimeString()
                    });
                }
            });
            
            if (shieldNotInDb.length > 0) {
                showToast(`⚠️ ${shieldNotInDb.length} shields not in database`, 'warn', 3500);
                renderFailedItems(shieldNotInDb);
            }
            if (changed > 0) {
                pushUndo(`Shield → ${targetType === 'defense' ? 'DEFENSE' : 'SUB SHIELD'}`, shieldChanges);
                const typeName = targetType === 'defense' ? 'DEFENSE' : 'SUB SHIELD';
                showToast(`✅ ${changed} shields changed to ${typeName}`, 'success');
                currentScannedItems = scanPlayerItems();
                renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
                updateItemStats();
                renderFixedItems();
            }
        });
    });

    // ==================== UTILITIES ====================
    function debounce(fn, wait = 220) {
        let timeout = null;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), wait);
        };
    }

    document.getElementById('rfFixerSearch').addEventListener('input', 
        debounce((e) => {
            renderScannedItems(e.target.value.trim());
        }, 220)
    );

    // Window controls
    document.getElementById('minimizeBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        isMinimized = !isMinimized;
        
        if (isMinimized) {
            box.classList.add('minimized');
            document.getElementById('minimizeBtn').textContent = '🗖';
            document.getElementById('minimizeBtn').title = 'Maximize';
        } else {
            box.classList.remove('minimized');
            document.getElementById('minimizeBtn').textContent = '─';
            document.getElementById('minimizeBtn').title = 'Minimize';
        }
    });

    document.getElementById('closeBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        cleanupAndClose();
    });

    // Draggable functionality
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    function onMouseMove(e) {
        if (!isDragging) return;
        box.style.left = (e.clientX - dragOffset.x) + 'px';
        box.style.top = (e.clientY - dragOffset.y) + 'px';
        box.style.right = 'auto';
        box.style.bottom = 'auto';
    }

    function onMouseUp() {
        isDragging = false;
        box.style.cursor = 'default';
    }

    document.getElementById('rfFixerHeader').addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('control-btn')) return;
        isDragging = true;
        const rect = box.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        box.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Auto refresh
    function refreshScannedItems() {
        const scanned = scanPlayerItems();
        const refreshed = scanned.map(i => {
            const analysis = analyzeItem(i.code);
            return {
                ...i,
                code: i.input.value.trim().toLowerCase(),
                qty: (i.input.getAttribute('data-qty') || i.qty || '1'),
                analysis: analysis,
                isValid: analysis ? analysis.isConvertible : false,
                currentRace: analysis ? analysis.race : null,
                needsFix: analysis ? analysis.needsFix : false
            };
        });
        
        const lastHash = currentScannedItems.map(i => i.input && i.input.value).join('|');
        const newHash = refreshed.map(i => i.input && i.input.value).join('|');
        
        if (newHash !== lastHash) {
            currentScannedItems = refreshed;
            renderScannedItems(document.getElementById('rfFixerSearch').value.trim());
            updateItemStats();
        }
    }

    // ==================== INITIALIZATION ====================
    async function initialize() {
        try {
            // Load kedua database secara paralel
            await Promise.all([
                loadItemDatabase(),
                loadWeaponDatabase()
            ]);
            
            // Detect player info
            const playerInfo = detectPlayerInfo();
            currentPlayerRace = playerInfo.race;
            currentPlayerNickname = playerInfo.nickname;
            
            updateRaceDisplay();
            
            // Initial scan
            currentScannedItems = scanPlayerItems();
            renderScannedItems();
            updateItemStats();
            
            // Setup intervals
            refreshIntervalId = setInterval(refreshScannedItems, 2500);
            raceDetectIntervalId = setInterval(() => {
                const newInfo = detectPlayerInfo();
                if (newInfo.race !== currentPlayerRace || newInfo.nickname !== currentPlayerNickname) {
                    currentPlayerRace = newInfo.race;
                    currentPlayerNickname = newInfo.nickname;
                    updateRaceDisplay();
                    refreshScannedItems();
                }
            }, 5000);
            
            // Add refresh database button
            const refreshDbBtn = document.createElement('button');
            refreshDbBtn.id = 'refreshDbBtn';
            refreshDbBtn.innerHTML = '🔄 REFRESH DATABASE';
            refreshDbBtn.className = 'refresh-db-btn';

        // Hover handled via CSS .refresh-db-btn:hover rule (no inline styles needed)

        let isRefreshing = false;
        refreshDbBtn.onclick = async () => {
            if (isRefreshing) return;
            
            isRefreshing = true;
            const originalText = refreshDbBtn.innerHTML;
            refreshDbBtn.innerHTML = '⏳ Loading...';
            refreshDbBtn.disabled = true;
            refreshDbBtn.style.opacity = '0.7';
            
            try {
                await Promise.all([
                    loadItemDatabase(true),
                    loadWeaponDatabase(true)
                ]);
                currentScannedItems = scanPlayerItems();
                renderScannedItems();
                updateItemStats();
                
                const wCount = weaponDatabase?.allWeapons?.length || 0;
                refreshDbBtn.innerHTML = `✅ DB Updated! (${wCount} weapons)`;
                setTimeout(() => {
                    refreshDbBtn.innerHTML = originalText;
                }, 1800);
            } catch (error) {
                refreshDbBtn.innerHTML = '❌ Update Failed';
                setTimeout(() => {
                    refreshDbBtn.innerHTML = originalText;
                }, 1500);
            } finally {
                isRefreshing = false;
                refreshDbBtn.disabled = false;
                refreshDbBtn.style.opacity = '1';
            }
        };
        
        document.getElementById('rfFixerBody').insertBefore(
            refreshDbBtn,
            document.querySelector('.armor-type-buttons')
        );

            // Initialize undo/redo button states
            updateUndoButtons();

        } catch (err) {
            logError('EZ Fix initialization failed:', err);
            const raceDisplay = document.getElementById('raceDisplay');
            if (raceDisplay) {
                raceDisplay.innerHTML = '❌ Init Error — reload page';
                raceDisplay.style.color = '#ed4245';
            }
        }
    }

    function cleanupAndClose() {
        if (refreshIntervalId) clearInterval(refreshIntervalId);
        if (raceDetectIntervalId) clearInterval(raceDetectIntervalId);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        box.remove();
    }

    // Start
    setTimeout(initialize, 800);

})();