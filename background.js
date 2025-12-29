/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const BLOCKABLE_URL = /^(http|file|about|moz-extension)/i;
const CLOCKABLE_URL = /^(http|file)/i;
const EXTENSION_URL = browser.runtime.getURL("");
const BLOCKED_PAGE_URL = browser.runtime.getURL(BLOCKED_PAGE);
const DELAYED_PAGE_URL = browser.runtime.getURL(DELAYED_PAGE);
const PASSWORD_PAGE_URL = browser.runtime.getURL(PASSWORD_PAGE);

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

var gStorage = browser.storage.local;
var gIsAndroid = false;
var gGotOptions = false;
var gOptions = {};
var gDiagMode = false;
var gNumSets;
var gTabs = [];
var gSetCounted = [];
var gSavedTimeData = [];
var gRegExps = [];
var gActiveTabId = 0;
var gPrevActiveTabId = 0;
var gFocusWindowId = 0;
var gClockOffset = 0;
var gIgnoreJumpSecs = 0;
var gAllFocused = false;
var gUseDocFocus = true;
var gOverrideIcon = false;
var gSaveSecsCount = 0;
var gTickerID;
var gTickerSecs = 1; // update every second by default

// Initialize object to track tab (returns false if already initialized)
//
function initTab(id) {
	if (gTabs[id]) {
		return false;
	} else {
		gTabs[id] = {
			allowedHost: null,
			allowedPath: null,
			allowedSet: 0,
			allowedEndTime: 0,
			referrer: "",
			url: "about:blank",
			incog: false,
			audible: false,
			focused: false,
			loaded: false,
			loadedTime: 0
		};
		return true;
	}
}

// Create (precompile) regular expressions
//
function createRegExps() {
	// Create new RegExp objects
	for (let set = 1; set <= gNumSets; set++) {
		gRegExps[set] = {};

		let blockRE = gOptions[`regexpBlock${set}`] || gOptions[`blockRE${set}`];
		gRegExps[set].block = blockRE ? new RegExp(blockRE, "i") : null;

		let allowRE = gOptions[`regexpAllow${set}`] || gOptions[`allowRE${set}`];
		gRegExps[set].allow = allowRE ? new RegExp(allowRE, "i") : null;

		let referRE = gOptions[`referRE${set}`];
		gRegExps[set].refer = referRE ? new RegExp(referRE, "i") : null;

		let keywordRE = gOptions[`keywordRE${set}`];
		gRegExps[set].keyword = keywordRE ? new RegExp(keywordRE, "iu") : null;
	}
}

// Test URL against block/allow regular expressions
//
function testURL(url, referrer, blockRE, allowRE, referRE, allowRefers) {
	let block = blockRE && blockRE.test(url);
	let allow = allowRE && allowRE.test(url);
	let refer = referRE && referRE.test(referrer);
	return allowRefers
		? block && !(allow || refer)	// refer as allow-condition
		: (block || refer) && !allow;	// refer as block-condition
}

// Refresh menus
//
function refreshMenus() {
	if (!browser.menus) {
		return; // no support for menus!
	}

	browser.menus.removeAll();

	let context = gOptions["contextMenu"] ? "all" : "action";

	// Options
	browser.menus.create({
		id: "options",
		title: browser.i18n.getMessage("optionsMenuItem"),
		contexts: [context]
	});

	// Lockdown
	browser.menus.create({
		id: "lockdown",
		title: browser.i18n.getMessage("lockdownMenuItem"),
		contexts: [context]
	});

	// Override
	browser.menus.create({
		id: "override",
		title: browser.i18n.getMessage("overrideMenuItem"),
		contexts: [context]
	});

	// Statistics
	browser.menus.create({
		id: "stats",
		title: browser.i18n.getMessage("statisticsMenuItem"),
		contexts: [context]
	});

	browser.menus.create({
		id: "separator",
		type: "separator",
		contexts: [context]
	});

	// Add Site
	browser.menus.create({
		id: "addSite",
		title: browser.i18n.getMessage("addSiteMenuItem"),
		contexts: [context]
	});

	// Add Site submenu
	for (let set = 1; set <= gNumSets; set++) {
		let title = browser.i18n.getMessage("addSiteToBlockSetMenuItem");
		let setName = gOptions[`setName${set}`];
		title += setName ? ` ${set} (${setName})` : ` ${set}`;
		browser.menus.create({
			id: `addSite-${set}`,
			parentId: "addSite",
			title: title,
			contexts: [context]
		});
	}

	// Add Page
	browser.menus.create({
		id: "addPage",
		title: browser.i18n.getMessage("addPageMenuItem"),
		contexts: [context]
	});

	// Add Page submenu
	for (let set = 1; set <= gNumSets; set++) {
		let title = browser.i18n.getMessage("addPageToBlockSetMenuItem");
		let setName = gOptions[`setName${set}`];
		title += setName ? ` ${set} (${setName})` : ` ${set}`;
		browser.menus.create({
			id: `addPage-${set}`,
			parentId: "addPage",
			title: title,
			contexts: [context]
		});
	}
}

// Refresh ticker for updates
//
function refreshTicker() {
	let processTabsSecs = +gOptions["processTabsSecs"];

	// Only restart ticker if interval has changed
	if (processTabsSecs != gTickerSecs) {
		gTickerSecs = processTabsSecs;
		window.clearInterval(gTickerID);
		gTickerID = window.setInterval(onInterval, gTickerSecs * 1000);
	}
}

// Retrieve options from storage
//
function retrieveOptions(update) {
	//log("retrieveOptions: " + update);

	browser.storage.local.get("sync").then(onGotSync, onError);

	function onGotSync(options) {
		gStorage = options["sync"]
				? browser.storage.sync
				: browser.storage.local;

		gStorage.get().then(onGot, onError);
	}

	function onGot(options) {
		// Copy retrieved options (exclude timedata if update)
		for (let option in options) {
			if (!update || !/^timedata/.test(option)) {
				gOptions[option] = options[option];
			}
		}
		gGotOptions = true;

		cleanOptions(gOptions);
		cleanTimeData(gOptions);

		gDiagMode = gOptions["diagMode"];

		gNumSets = +gOptions["numSets"];

		gClockOffset = +gOptions["clockOffset"];
		gIgnoreJumpSecs = +gOptions["ignoreJumpSecs"];
		gAllFocused = gOptions["allFocused"];
		gUseDocFocus = gOptions["useDocFocus"];

		createRegExps();
		refreshMenus();
		refreshTicker();
		loadSiteLists();
		updateIcon();

		// Keep track of saved time data to avoid unnecessary writes
		for (let set = 1; set <= gNumSets; set++) {
			gSavedTimeData[set] = gOptions[`timedata${set}`].toString();
		}
	}

	function onError(error) {
		gGotOptions = false;
		warn("Cannot get options: " + error);
	}
}

// Load lists of sites if URLs specified
//
function loadSiteLists() {
	//log("loadSiteLists");

	let time = Date.now();

	for (let set = 1; set <= gNumSets; set++) {
		// Get sites for block set from HTTP source (if specified)
		let sitesURL = gOptions[`sitesURL${set}`];
		if (sitesURL) {
			sitesURL = sitesURL.replace(/\$S/, set).replace(/\$T/, time);
			fetch(sitesURL).then(
				(response) => {
					if (response.status == 200) {
						response.text().then((text) => { onLoad(set, text); });
					} else {
						warn("Cannot load sites from URL: " + sitesURL);
					}
				},
				(reason) => {
					warn("Cannot load sites from URL: " + sitesURL);
				});
		}
	}

	function onLoad(set, sites) {
		if (set && sites) {
			sites = cleanSites(sites);

			// Get regular expressions to match sites
			let regexps = getRegExpSites(sites, gOptions["matchSubdomains"]);

			// Update options
			gOptions[`sites${set}`] = sites;
			gOptions[`blockRE${set}`] = regexps.block;
			gOptions[`allowRE${set}`] = regexps.allow;
			gOptions[`referRE${set}`] = regexps.refer;
			gOptions[`keywordRE${set}`] = regexps.keyword;

			createRegExps();

			// Save updated options to local storage
			let options = {};
			options[`sites${set}`] = sites;
			options[`blockRE${set}`] = regexps.block;
			options[`allowRE${set}`] = regexps.allow;
			options[`referRE${set}`] = regexps.refer;
			options[`keywordRE${set}`] = regexps.keyword;
			gStorage.set(options).catch(
				function (error) { warn("Cannot set options: " + error); }
			);
		}
	}
}

// Save time data to storage
//
function saveTimeData() {
	//log("saveTimeData");

	if (!gGotOptions) {
		return;
	}

	let options = {};
	let touched = false;
	for (let set = 1; set <= gNumSets; set++) {
		let timedata = gOptions[`timedata${set}`];
		if (gSavedTimeData[set] != timedata.toString()) {
			options[`timedata${set}`] = timedata;
			gSavedTimeData[set] = timedata.toString();
			touched = true;
		}
	}
	if (touched) {
		gStorage.set(options).catch(
			function (error) { warn("Cannot save time data: " + error); }
		);
	}
}

// Restart time data
//
function restartTimeData(set) {
	//log("restartTimeData: " + set);

	if (!gGotOptions || set < 0 || set > gNumSets) {
		return;
	}

	// Get current time in seconds
	let now = Math.floor(Date.now() / 1000) + (gClockOffset * 60);

	if (!set) {
		for (set = 1; set <= gNumSets; set++) {
			gOptions[`timedata${set}`][0] = now;
			gOptions[`timedata${set}`][1] = 0;
		}
	} else {
		gOptions[`timedata${set}`][0] = now;
		gOptions[`timedata${set}`][1] = 0;
	}

	saveTimeData();
}

// Reorder time data
//
function reorderTimeData(ordering) {
	//log("reorderTimeData: " + ordering);

	if (!ordering) {
		return;
	}

	// Create copy of time data for each set
	let timedata = [];
	for (let set = 1; set <= gNumSets; set++) {
		timedata[set] = gOptions[`timedata${set}`].slice();
	}

	// Reorder time data according to specified ordering
	for (let set = 1; set <= gNumSets; set++) {
		if (ordering[set] <= gNumSets) {
			gOptions[`timedata${set}`] = timedata[ordering[set]];
		}
	}

	saveTimeData();
}

// Update ID of focused window
//
function updateFocusedWindowId() {
	if (!browser.windows) {
		return; // no support for windows!
	}

	browser.windows.getCurrent().then(
		function (win) {
			gFocusWindowId = win.focused ? win.id : browser.windows.WINDOW_ID_NONE;
		},
		function (error) {
			warn("Cannot get current window: " + error);
		}
	);
}

// Process tabs: update time spent and check for blocks
//
function processTabs(active) {
	//log("processTabs: " + active);

	gSetCounted = []; // reset

	if (active) {
		// Process only active tabs
		browser.tabs.query({ active: true }).then(onGot, onError);
	} else {
		// Process all tabs
		browser.tabs.query({}).then(onGot, onError);
	}

	function onGot(tabs) {
		for (let tab of tabs) {
			initTab(tab.id);

			let focus = tab.active && (gAllFocused || !gFocusWindowId || tab.windowId == gFocusWindowId)
					&& (!gIsAndroid || !gUseDocFocus || gTabs[tab.id].focused);

			gTabs[tab.id].incog = tab.incognito;
			gTabs[tab.id].audible = tab.audible;

			// Force update of time spent on this page
			clockPageTime(tab.id, false, false);
			clockPageTime(tab.id, true, focus);

			if (/^(about|view-source)/i.test(tab.url)) {
				gTabs[tab.id].loaded = true;
				gTabs[tab.id].loadedTime = Date.now();
				gTabs[tab.id].url = getCleanURL(tab.url);
			}

			if (gTabs[tab.id].loaded) {
				// Check tab to see if page should be blocked
				let blocked = checkTab(tab.id, false, true);

				if (!blocked && tab.active) {
					updateTimer(tab.id);
				}
			} else if (CLOCKABLE_URL.test(tab.url)) {
				// Ping tab to see if content script has loaded
				let message = { type: "ping" };
				browser.tabs.sendMessage(tab.id, message).catch(function (error) {});
			}
		}
	}

	function onError(error) {
		warn("Cannot get tabs: " + error);
	}
}

// Check the URL of a tab and applies block if necessary (returns true if blocked)
//
function checkTab(id, isBeforeNav, isRepeat) {
	//log("checkTab: " + id + " " + isBeforeNav + " " + isRepeat);

	function isSameHost(host1, host2) {
		return (host1 == host2)
				|| (host1 == "www." + host2)
				|| (host2 == "www." + host1);
	}

	let url = gTabs[id].url;

	gTabs[id].blockable = BLOCKABLE_URL.test(url);
	gTabs[id].clockable = CLOCKABLE_URL.test(url);

	// Quick exit for the following cases:
	// - about:blank
	// - non-blockable URLs
	// - blocking pages
	// - LeechBlock website (documentation should be available by default)
	if (url == "about:blank"
			|| !gTabs[id].blockable
			|| url.startsWith(BLOCKED_PAGE_URL)
			|| url.startsWith(DELAYED_PAGE_URL)
			|| url.startsWith(PASSWORD_PAGE_URL)
			|| (url.startsWith(LEECHBLOCK_URL) && gOptions["allowLBWebsite"])) {
		return false; // not blocked
	}

	// Get parsed URL for this page
	let parsedURL = getParsedURL(url);

	// Get current time in seconds
	let now = Math.floor(Date.now() / 1000) + (gClockOffset * 60);

	// Check for allowed host/path (or end of allowed time)
	let allowHost = isSameHost(gTabs[id].allowedHost, parsedURL.host);
	let allowPath = !gTabs[id].allowedPath || (gTabs[id].allowedPath == parsedURL.path);
	let allowedSet = gTabs[id].allowedSet;
	let allowedEndTime = gTabs[id].allowedEndTime;
	if (!allowHost || !allowPath || (allowedEndTime && now > allowedEndTime)) {
		// Allowing delayed site/page no longer applies
		gTabs[id].allowedHost = null;
		gTabs[id].allowedPath = null;
		gTabs[id].allowedSet = 0;
		gTabs[id].allowedEndTime = 0;
	}

	// Get referrer URL for this page
	let referrer = gTabs[id].referrer;

	// Get current time/date
	let timedate = new Date(now * 1000);

	gTabs[id].secsLeft = Infinity;
	gTabs[id].secsLeftSet = 0;
	gTabs[id].showTimer = false;

	for (let set = 1; set <= gNumSets; set++) {
		// Do nothing if set is disabled
		if (gOptions[`disable${set}`]) continue;

		if (allowHost && allowPath && allowedSet == set) {
			// Allow delayed site/page
			let secsLeft = allowedEndTime - now;
			if (secsLeft > 0) {
				gTabs[id].secsLeft = secsLeft;
				gTabs[id].secsLeftSet = set;
				gTabs[id].showTimer = gOptions[`showTimer${set}`];
			}
			continue;
		}

		// Check incognito mode
		let incogMode = gOptions[`incogMode${set}`];
		let incog = gTabs[id].incog;
		if ((incogMode == 1 && incog) || (incogMode == 2 && !incog)) continue;

		// Check for blocking only active tabs
		let onlyActive = gOptions[`onlyActive${set}`];
		if (onlyActive && (id != gActiveTabId)) continue;

		// Check for wait time (if specified)
		let waitSecs = gOptions[`waitSecs${set}`];
		let loadedTime = gTabs[id].loadedTime;
		if (waitSecs && loadedTime) {
			let loadTime = Math.floor(loadedTime / 1000) + (gClockOffset * 60);
			if ((now - loadTime) < waitSecs) continue; // too soon to check for block!
		}

		// Get URL of page (possibly with hash part)
		let pageURL = parsedURL.page;
		let pageURLWithHash = parsedURL.page;
		if (parsedURL.hash != null) {
			pageURLWithHash +=  "#" + parsedURL.hash;
			if (/^!/.test(parsedURL.hash) || !gOptions[`ignoreHash${set}`]) {
				pageURL = pageURLWithHash;
			}
		}
		let isInternalPage = /^about:(addons|support|profiles|debugging)/i.test(pageURL);

		// Get regular expressions for matching sites to block/allow
		let blockRE = gRegExps[set].block;
		let allowRE = gRegExps[set].allow;
		let referRE = gRegExps[set].refer;
		let keywordRE = gRegExps[set].keyword;
		if (!blockRE && !referRE) continue; // no block for this set

		if (keywordRE && !isInternalPage && isBeforeNav) continue; // too soon to check for keywords!

		// Get option for treating referrers as allow-conditions
		let allowRefers = gOptions[`allowRefers${set}`];

		if (referRE && allowRefers && isBeforeNav) continue; // too soon to check for referrers!

		// Get options for preventing access to about:addons and about:support
		let prevAddons = gOptions[`prevAddons${set}`];
		let prevSupport = gOptions[`prevSupport${set}`];
		let prevProfiles = gOptions[`prevProfiles${set}`];
		let prevDebugging = gOptions[`prevDebugging${set}`];
		let prevOverride = gOptions[`prevOverride${set}`];

		// Test URL against block/allow regular expressions
		if (testURL(pageURL, referrer, blockRE, allowRE, referRE, allowRefers)
				|| (prevAddons && /^about:addons/i.test(pageURL))
				|| (prevSupport && /^about:support/i.test(pageURL))
				|| (prevProfiles && /^about:profiles/i.test(pageURL))
				|| (prevDebugging && /^about:debugging/i.test(pageURL))) {
			// Get options for this set
			let timedata = gOptions[`timedata${set}`];
			let times = gOptions[`times${set}`];
			let minPeriods = getMinPeriods(times);
			let limitMins = gOptions[`limitMins${set}`];
			let limitPeriod = gOptions[`limitPeriod${set}`];
			let limitOffset = gOptions[`limitOffset${set}`];
			let periodStart = getTimePeriodStart(now, limitPeriod, limitOffset);
			let rollover = gOptions[`rollover${set}`];
			let conjMode = gOptions[`conjMode${set}`];
			let days = gOptions[`days${set}`];
			let blockURL = gOptions[`blockURL${set}`];
			let applyFilter = gOptions[`applyFilter${set}`];
			let filterName = gOptions[`filterName${set}`];
			let filterMute = gOptions[`filterMute${set}`];
			let closeTab = gOptions[`closeTab${set}`];
			let activeBlock = gOptions[`activeBlock${set}`];
			let titleOnly = gOptions[`titleOnly${set}`];
			let addHistory = gOptions[`addHistory${set}`];
			let allowOverride = gOptions[`allowOverride${set}`];
			let allowOverLock = gOptions[`allowOverLock${set}`];
			let showTimer = gOptions[`showTimer${set}`];
			let allowKeywords = gOptions[`allowKeywords${set}`];

			updateRolloverTime(timedata, limitMins, limitPeriod, periodStart);

			// Check day
			let onSelectedDay = days[timedate.getDay()];

			// Check time periods
			let secsLeftBeforePeriod = Infinity;
			if (onSelectedDay && times) {
				// Get number of minutes elapsed since midnight
				let mins = timedate.getHours() * 60 + timedate.getMinutes();

				// Check each time period in turn
				for (let mp of minPeriods) {
					if (mins >= mp.start && mins < mp.end) {
						secsLeftBeforePeriod = 0;
					} else if (mins < mp.start) {
						// Compute exact seconds before this time period starts
						let secs = (mp.start - mins) * 60 - timedate.getSeconds();
						if (secs < secsLeftBeforePeriod) {
							secsLeftBeforePeriod = secs;
						}
					}
				}
			}

			// Check time limit
			let secsLeftBeforeLimit = Infinity;
			if (onSelectedDay && limitMins && limitPeriod) {
				// Compute exact seconds before this time limit expires
				let secsRollover = rollover ? timedata[5] : 0;
				secsLeftBeforeLimit = secsRollover + (limitMins * 60);
				if (timedata[2] == periodStart) {
					let secs = secsLeftBeforeLimit - timedata[3];
					secsLeftBeforeLimit = Math.max(0, secs);
				}
			}

			let withinTimePeriods = (secsLeftBeforePeriod == 0);
			let afterTimeLimit = (secsLeftBeforeLimit == 0);

			// Check lockdown condition
			let lockdown = (timedata[4] > now);

			// Check override condition (per-set override stored in timedata[8])
			// Note: allowOverride is checked at activation time, not here, so active overrides
			// persist until end time even if allowOverride is later disabled (matching lockdown behavior)
			let overrideEndTime = timedata[8];
			let override = (prevOverride || !isInternalPage) && (overrideEndTime > now)
					&& (allowOverLock || !lockdown);

			// Determine whether this page should now be blocked
			let doBlock = lockdown
					|| (!conjMode && (withinTimePeriods || afterTimeLimit))
					|| (conjMode && (withinTimePeriods && afterTimeLimit));

			// Apply block if all relevant block conditions are fulfilled
			if (!override && doBlock && (!isRepeat || activeBlock)) {

				function applyBlock(keyword) {
					if (gDiagMode) {
						log("### BLOCK APPLIED ###");
						log(`id: ${id}`);
						log(`isBeforeNav: ${isBeforeNav}`);
						log(`isRepeat: ${isRepeat}`);
						log(`timedate: ${timedate}`);
						log(`set: ${set}`);
						log(`pageURL: ${pageURL}`);
						log(`referrer: ${referrer}`);
						log(`lockdown: ${lockdown}`);
						log(`withinTimePeriods: ${withinTimePeriods}`);
						log(`afterTimeLimit: ${afterTimeLimit}`);
						log(`blockURL: ${blockURL}`);
						if (blockRE) {
							let res = blockRE.exec(pageURL);
							if (res) {
								log(`blockRE.exec: ${res[0]}`);
							}
						}
						if (referRE) {
							let res = referRE.exec(referrer);
							if (res) {
								log(`referRE.exec: ${res[0]}`);
							}
						}
						if (keyword) {
							log(`keyword: ${keyword}`);
						}
					}
					if (closeTab) {
						// Close tab
						browser.tabs.remove(id);
					} else if (applyFilter) {
						gTabs[id].filterSet = set;

						// Mute tab if option selected
						if (filterMute) {
							browser.tabs.update(id, { "muted": true });
						}

						// Send message to tab
						let message = {
							type: "filter",
							name: filterName
						};
						browser.tabs.sendMessage(id, message).catch(
							function (error) {}
						);
					} else {
						gTabs[id].keyword = keyword;

						if (browser.history && addHistory && !isInternalPage) {
							// Add blocked page to browser history
							browser.history.addUrl({ url: pageURLWithHash });
						}

						// Get final URL for block page
						blockURL = getLocalizedURL(blockURL)
								.replace(/\$K/g, keyword ? keyword : "")
								.replace(/\$S/g, set)
								.replace(/\$U/g, pageURLWithHash);

						// Redirect page
						browser.tabs.update(id, { url: blockURL });
					}
				}

				if (keywordRE && !isInternalPage) {
					// Check for keyword(s) before blocking
					let message = {
						type: "keyword",
						keywordRE: keywordRE,
						titleOnly: titleOnly
					};
					browser.tabs.sendMessage(id, message).then(
						function (keyword) {
							if ((!allowKeywords && typeof keyword == "string")
									|| (allowKeywords && keyword == null)) {
								applyBlock(keyword);
							}
						},
						function (error) {}
					);
				} else {
					applyBlock();
					return true; // blocked
				}
			}

			// Clear filter if no longer blocked
			if (set == gTabs[id].filterSet && (override || !doBlock)) {
				gTabs[id].filterSet = undefined;

				// Unmute tab if option selected
				if (filterMute) {
					browser.tabs.update(id, { "muted": false });
				}

				// Send message to tab
				let message = {
					type: "filter",
					name: null
				};
				browser.tabs.sendMessage(id, message).catch(
					function (error) {}
				);
			}

			// Update seconds left before block
			let secsLeft = conjMode
					? (withinTimePeriods ? secsLeftBeforeLimit : Infinity)
					: Math.min(secsLeftBeforePeriod, secsLeftBeforeLimit);
			if (override) {
				secsLeft = Math.max(secsLeft, overrideEndTime - now);
			}
			if (secsLeft < gTabs[id].secsLeft) {
				gTabs[id].secsLeft = secsLeft;
				gTabs[id].secsLeftSet = set;
				gTabs[id].showTimer = showTimer;
			}
		}
	}

	checkWarning(id);

	return false; // not blocked
}

// Check for warning message (and display message if needed)
//
function checkWarning(id) {
	let set = gTabs[id].secsLeftSet;
	if (set < 1 || set > gNumSets) {
		return;
	}

	let warnSecs = gOptions["warnSecs"];
	let canWarn = !gOptions["warnImmediate"] || gOptions[`activeBlock${set}`]

	if (warnSecs && canWarn) {
		let secsLeft = Math.round(gTabs[id].secsLeft);
		if (secsLeft > warnSecs) {
			gTabs[id].warned = false;
		} else if (secsLeft > 0 && !gTabs[id].warned) {
			gTabs[id].warned = true;

			// Send message to tab
			let text = `Sites in Block Set ${set}`;
			let setName = gOptions[`setName${set}`];
			if (setName) {
				text += ` (${setName})`;
			}
			text += ` will be blocked in ${secsLeft} seconds.`;
			let message = {
				type: "alert",
				text: text
			};
			browser.tabs.sendMessage(id, message).catch(
				function (error) { gTabs[id].warned = false; }
			);
		}
	}
}

// Clock time spent on page
//
function clockPageTime(id, open, focus) {
	if (!gTabs[id]) {
		return;
	}

	if (!gTabs[id].clockable) {
		gTabs[id].openTime = undefined;
		gTabs[id].focusTime = undefined;
		return;
	}

	// Get current time in milliseconds
	let time = Date.now();

	// Clock time during which page has been open
	let secsOpen = 0;
	if (open) {
		if (gTabs[id].openTime == undefined) {
			// Set open time for this page
			gTabs[id].openTime = time;
		}
	} else {
		if (gTabs[id].openTime != undefined) {
			// Calculate seconds spent on this page (while open)
			secsOpen = ((time - gTabs[id].openTime) / 1000);

			gTabs[id].openTime = undefined;
		}
	}

	// Clock time during which page has been focused
	let secsFocus = 0;
	if (focus) {
		if (gTabs[id].focusTime == undefined) {
			// Set focus time for this page
			gTabs[id].focusTime = time;
		}
	} else {
		if (gTabs[id].focusTime != undefined) {
			// Calculate seconds spent on this page (while focused)
			secsFocus = ((time - gTabs[id].focusTime) / 1000);

			gTabs[id].focusTime = undefined;
		}
	}

	// Update time data if necessary
	if (secsOpen > 0 || secsFocus > 0) {
		updateTimeData(id, secsOpen, secsFocus);
	}
}

// Update time data for specified page
//
function updateTimeData(id, secsOpen, secsFocus) {
	//log("updateTimeData: " + id + " " + secsOpen + " " + secsFocus);

	let referrer = gTabs[id].referrer;
	let url = gTabs[id].url;
	let incog = gTabs[id].incog;
	let audible = gTabs[id].audible;

	// Get parsed URL for this page
	let parsedURL = getParsedURL(url);

	// Get current time in seconds
	let now = Math.floor(Date.now() / 1000) + (gClockOffset * 60);

	// Get current time/date
	let timedate = new Date(now * 1000);

	for (let set = 1; set <= gNumSets; set++) {
		// Get regular expressions for matching sites to block/allow
		let blockRE = gRegExps[set].block;
		let allowRE = gRegExps[set].allow;
		let referRE = gRegExps[set].refer;
		if (!blockRE && !referRE) continue; // no block for this set

		// Check incognito mode
		let incogMode = gOptions[`incogMode${set}`];
		if ((incogMode == 1 && incog) || (incogMode == 2 && !incog)) continue;

		// Get option for counting time only when tab is playing audio
		let countAudio = gOptions[`countAudio${set}`];
		if (countAudio && !audible) continue; // no audio playing

		// Get option for treating referrers as allow-conditions
		let allowRefers = gOptions[`allowRefers${set}`];

		// Get URL of page (possibly with hash part)
		let pageURL = parsedURL.page;
		if (parsedURL.hash != null) {
			if (/^!/.test(parsedURL.hash) || !gOptions[`ignoreHash${set}`]) {
				pageURL += "#" + parsedURL.hash;
			}
		}

		// Test URL against block/allow regular expressions
		if (testURL(pageURL, referrer, blockRE, allowRE, referRE, allowRefers)) {
			// Get options for this set
			let timedata = gOptions[`timedata${set}`];
			let countFocus = gOptions[`countFocus${set}`];
			let times = gOptions[`times${set}`];
			let minPeriods = getMinPeriods(times);
			let limitMins = gOptions[`limitMins${set}`];
			let limitPeriod = gOptions[`limitPeriod${set}`];
			let limitOffset = gOptions[`limitOffset${set}`];
			let periodStart = getTimePeriodStart(now, limitPeriod, limitOffset);
			let rollover = gOptions[`rollover${set}`];
			let conjMode = gOptions[`conjMode${set}`];
			let days = gOptions[`days${set}`];

			// Avoid overcounting time for non-focused tabs
			if (!countFocus && gSetCounted[set]) {
				continue;
			} else {
				gSetCounted[set] = true;
			}

			// Reset time data if currently invalid
			if (!Array.isArray(timedata)) {
				timedata = [now, 0, 0, 0, 0, 0, 0, 0];
			} else while (timedata.length < 8) {
				timedata.push(0);
			}

			updateRolloverTime(timedata, limitMins, limitPeriod, periodStart);

			// Get number of seconds spent on page (focused or open)
			let secsSpent = countFocus ? secsFocus : secsOpen;

			if (gIgnoreJumpSecs && secsSpent > gIgnoreJumpSecs) continue;

			// Update data for total time spent
			timedata[1] = +timedata[1] + secsSpent;

			// Determine whether we should count time spent on page in
			// specified time period (we should only count time on selected
			// days -- and in conjunction mode, only within time periods)
			let countTimeSpentInPeriod = days[timedate.getDay()];
			if (countTimeSpentInPeriod && conjMode) {
				countTimeSpentInPeriod = false;

				// Get number of minutes elapsed since midnight
				let mins = timedate.getHours() * 60 + timedate.getMinutes();

				// Check each time period in turn
				for (let mp of minPeriods) {
					if (mins >= mp.start && mins < mp.end) {
						countTimeSpentInPeriod = true;
					}
				}
			}

			// Update data for time spent in specified time period
			if (countTimeSpentInPeriod && periodStart > 0 && timedata[2] >= 0) {
				if (timedata[2] != periodStart) {
					// We've entered a new time period, so start new count
					timedata[2] = periodStart;
					timedata[3] = secsSpent;
				} else {
					// We haven't entered a new time period, so keep counting
					timedata[3] = +timedata[3] + secsSpent;
				}

				// Update rollover time for next period
				timedata[6] = Math.max(0, (limitMins * 60) - timedata[3]);
				timedata[7] = periodStart + (+limitPeriod);
			}

			// Update time data for this set
			gOptions[`timedata${set}`] = timedata;
		}
	}
}

// Update timer
//
function updateTimer(id) {
	if (!gTabs[id] || !gTabs[id].clockable) {
		return;
	}

	let secsLeft = gTabs[id].secsLeft;
	let showTimer = gTabs[id].showTimer;

	// Send message to tab
	let message = {
		type: "timer",
		size: gOptions["timerSize"],
		location: gOptions["timerLocation"]
	};
	if (!gOptions["timerVisible"] || secsLeft == Infinity || !showTimer) {
		message.text = null; // hide timer
	} else {
		message.text = formatTime(secsLeft); // show timer with time left
	}
	browser.tabs.sendMessage(id, message).catch(function (error) {});

	// Set tooltip
	if (!gIsAndroid) {
		if (secsLeft == Infinity) {
			browser.action.setTitle({ title: null, tabId: id });
		} else {
			let title = "LeechBlock [" + formatTime(secsLeft) + "]"
			browser.action.setTitle({ title: title, tabId: id });
		}
	}

	// Set badge timer (if option selected)
	if (!gIsAndroid && gOptions["timerBadge"] && secsLeft < 600 && showTimer) {
		let m = Math.floor(secsLeft / 60);
		let s = Math.floor(secsLeft) % 60;
		let text = m + ":" + ((s < 10) ? "0" + s : s);
		browser.action.setBadgeBackgroundColor({ color: "#666" });
		browser.action.setBadgeText({ text: text, tabId: id });
	} else {
		browser.action.setBadgeText({ text: "", tabId: id });
	}
}

// Update button icon
//
function updateIcon() {
	if (gIsAndroid) {
		return; // icon not supported yet
	}

	// Get current time in seconds
	let now = Math.floor(Date.now() / 1000) + (gClockOffset * 60);

	// Check if any block set has active override (per-set override stored in timedata[8])
	let anyOverrideActive = false;
	for (let set = 1; set <= gNumSets; set++) {
		let timedata = gOptions[`timedata${set}`];
		if (timedata && timedata[8] > now) {
			anyOverrideActive = true;
			break;
		}
	}

	// Change icon only if override status has changed
	if (!gOverrideIcon && anyOverrideActive) {
		browser.action.setIcon({ path: OVERRIDE_ICON });
		gOverrideIcon = true;
	} else if (gOverrideIcon && !anyOverrideActive) {
		browser.action.setIcon({ path: DEFAULT_ICON });
		gOverrideIcon = false;
	}
}

// Create info for blocking page
//
function createBlockInfo(id, url) {
	// Get theme
	let theme = gOptions["theme"];

	// Get custom style
	let customStyle = gOptions["customStyle"];

	// Get parsed URL
	let parsedURL = getParsedURL(url);
	let pageURL = parsedURL.page;

	if (parsedURL.args == null || parsedURL.args.length < 2) {
		warn("Cannot create block info: not enough arguments in URL.");
		return { theme: theme, customStyle: customStyle };
	}

	// Get block set and URL (including hash part) of blocked page
	let blockedSet = parsedURL.args.shift();
	let blockedSetName = gOptions[`setName${blockedSet}`];
	let blockedURL = parsedURL.query.substring(blockedSet.length + 2); // retains original separators (& or ;)
	if (parsedURL.hash != null) {
		blockedURL += "#" + parsedURL.hash;
	}

	// Get disable link option
	let disableLink = gOptions["disableLink"];

	// Get keyword match (if applicable)
	let keywordMatch = gOptions[`showKeyword${blockedSet}`] ? gTabs[id].keyword : null;

	// Get password
	let passwordRequire = gOptions[`passwordRequire${blockedSet}`];
	let password = gOptions[`passwordSetSpec${blockedSet}`]; // set-specific password
	if (passwordRequire == 1) {
		password = gOptions["orp"]; // override password
	} else if (passwordRequire == 2) {
		password = gOptions["password"]; // access control password
	}

	// Get custom message
	let customMsg = gOptions[`customMsg${blockedSet}`];

	// Get unblock time for block set
	let unblockTime = getUnblockTime(blockedSet);
	if (unblockTime != null) {
		// Get current date of the month
		let date = new Date(Date.now() + (gClockOffset * 60000)).getDate();

		// Get clock time format
		let clockTimeOpts = {};
		let clockTimeFormat = gOptions["clockTimeFormat"];
		if (clockTimeFormat > 0) {
			clockTimeOpts.hour12 = (clockTimeFormat == 1);
		}

		// Convert to string
		if (unblockTime.getDate() == date) {
			// Same day: show time only
			unblockTime = unblockTime.toLocaleTimeString(undefined, clockTimeOpts);
		} else {
			// Different day: show date and time
			unblockTime = unblockTime.toLocaleString(undefined, clockTimeOpts);
		}
	}

	// Get delaying info for block set
	let delaySecs = gOptions[`delaySecs${blockedSet}`];
	let delayCancel = gOptions[`delayCancel${blockedSet}`];

	// Get reloading time (if specified)
	let reloadSecs = gOptions[`reloadSecs${blockedSet}`];

	return {
		theme: theme,
		customStyle: customStyle,
		blockedSet: blockedSet,
		blockedSetName: blockedSetName,
		blockedURL: blockedURL,
		disableLink: disableLink,
		keywordMatch: keywordMatch,
		password: password,
		customMsg: customMsg,
		unblockTime: unblockTime,
		delaySecs: delaySecs,
		delayCancel: delayCancel,
		reloadSecs: reloadSecs
	};
}

// Return time when blocked sites will be unblocked (as Date object)
//
function getUnblockTime(set) {
	//log("getUnlockTime: " + set);

	if (!gGotOptions || set < 1 || set > gNumSets) {
		return null;
	}

	// Get current time in seconds
	let now = Math.floor(Date.now() / 1000) + (gClockOffset * 60);

	// Get current time/date
	let timedate = new Date(now * 1000);

	// Get options for this set
	let timedata = gOptions[`timedata${set}`];
	let times = gOptions[`times${set}`];
	let minPeriods = getMinPeriods(times);
	let limitMins = gOptions[`limitMins${set}`];
	let limitPeriod = gOptions[`limitPeriod${set}`];
	let limitOffset = gOptions[`limitOffset${set}`];
	let periodStart = getTimePeriodStart(now, limitPeriod, limitOffset);
	let rollover = gOptions[`rollover${set}`];
	let conjMode = gOptions[`conjMode${set}`];
	let days = gOptions[`days${set}`];

	// Check for valid time data
	if (!Array.isArray(timedata) || timedata.length < 8) {
		return null;
	}

	updateRolloverTime(timedata, limitMins, limitPeriod, periodStart);

	// Check for 24/7 block
	if (times == ALL_DAY_TIMES && allTrue(days) && !conjMode) {
		return null;
	}

	// Check for lockdown
	if (now < timedata[4]) {
		// Return end time for lockdown
		return new Date(timedata[4] * 1000);
	}

	// Get number of minutes elapsed since midnight
	let mins = timedate.getHours() * 60 + timedate.getMinutes();

	// Create list of time periods for today and following seven days
	let day = timedate.getDay();
	let allMinPeriods = [];
	for (let i = 0; i <= 7; i++) {
		if (days[(day + i) % 7]) {
			let offset = (i * 1440);
			for (let mp of minPeriods) {
				// Create new time period with offset
				let mp1 = {
					start: (mp.start + offset),
					end: (mp.end + offset)
				};
				if (allMinPeriods.length == 0) {
					// Add new time period
					allMinPeriods.push(mp1);
				} else {
					let mp0 = allMinPeriods[allMinPeriods.length - 1];
					if (mp1.start <= mp0.end) {
						// Merge time period into previous one
						mp0.end = mp1.end;
					} else {
						// Add new time period
						allMinPeriods.push(mp1);
					}
				}
			}
		}
	}

	let timePeriods = (times != "");
	let timeLimit = (limitMins && limitPeriod);

	if (timePeriods && !timeLimit) {
		// Case 1: within time periods (no time limit)

		// Find relevant time period
		for (let mp of allMinPeriods) {
			if (mins >= mp.start && mins < mp.end) {
				// Return end time for time period
				return new Date(
						timedate.getFullYear(),
						timedate.getMonth(),
						timedate.getDate(),
						0, mp.end);
			}
		}
	} else if (!timePeriods && timeLimit) {
		// Case 2: after time limit (no time periods)

		// Return end time for current time limit period
		return new Date(timedata[2] * 1000 + limitPeriod * 1000);
	} else if (timePeriods && timeLimit) {
		if (conjMode) {
			// Case 3: within time periods AND after time limit

			// Find relevant time period
			for (let mp of allMinPeriods) {
				if (mins >= mp.start && mins < mp.end) {
					// Return the earlier of the two end times
					let td1 = new Date(
							timedate.getFullYear(),
							timedate.getMonth(),
							timedate.getDate(),
							0, mp.end);
					let td2 = new Date(timedata[2] * 1000 + limitPeriod * 1000);
					return (td1 < td2) ? td1 : td2;
				}
			}
		} else {
			// Case 4: within time periods OR after time limit

			// Determine whether time limit was exceeded
			let secsRollover = rollover ? timedata[5] : 0;
			let afterTimeLimit = (timedata[2] == periodStart)
					&& (timedata[3] >= secsRollover + (limitMins * 60));

			if (afterTimeLimit) {
				// Check against end time for current time limit period instead
				let td = new Date(timedata[2] * 1000 + limitPeriod * 1000);
				mins = td.getHours() * 60 + td.getMinutes();
			}

			// Find relevant time period
			for (let mp of allMinPeriods) {
				if (mins >= mp.start && mins < mp.end) {
					// Return end time for time period
					return new Date(
							timedate.getFullYear(),
							timedate.getMonth(),
							timedate.getDate(),
							0, mp.end);
				}
			}

			// Return end time for current time limit period
			return new Date(timedata[2] * 1000 + limitPeriod * 1000);
		}
	}

	return null;
}

// Apply lockdown for specified set
//
function applyLockdown(set, endTime) {
	//log("applyLockdown: " + set + " " + endTime);

	if (!gGotOptions || set < 1 || set > gNumSets) {
		return;
	}

	// Apply lockdown only if it doesn't reduce any current lockdown
	if (endTime > gOptions[`timedata${set}`][4]) {
		gOptions[`timedata${set}`][4] = endTime;
	}

	saveTimeData();
}

// Cancel lockdown for specified set
//
function cancelLockdown(set) {
	//log("cancelLockdown: " + set);

	if (!gGotOptions || set < 1 || set > gNumSets) {
		return;
	}

	gOptions[`timedata${set}`][4] = 0;

	saveTimeData();
}

// Apply override for specified set
//
function applyOverride(set, endTime, countLimit) {
	//log("applyOverride: " + set + " " + endTime);

	if (!gGotOptions || set < 1 || set > gNumSets) {
		return;
	}

	let options = {};

	// Apply override only if it doesn't reduce any current override
	if (endTime > gOptions[`timedata${set}`][8]) {
		gOptions[`timedata${set}`][8] = endTime;
	}

	if (countLimit && endTime) {
		// Get current time in seconds
		let now = Math.floor(Date.now() / 1000) + (gClockOffset * 60);

		// Update override limit count (if specified)
		let orln = gOptions["orln"];
		let orlp = gOptions["orlp"];
		let orlps = gOptions["orlps"];
		let orlc = gOptions["orlc"];
		if (orln && orlp) {
			let periodStart = getTimePeriodStart(now, orlp);
			if (orlps != periodStart) {
				// We've entered a new time period, so start new count
				orlps = periodStart;
				orlc = 1;
			} else {
				// We haven't entered a new time period, so keep counting
				orlc++;
			}
		} else {
			orlps = 0;
			orlc = 0;
		}
		options["orlps"] = gOptions["orlps"] = orlps;
		options["orlc"] = gOptions["orlc"] = orlc;
	}

	// Save updated options to storage
	gStorage.set(options).catch(
		function (error) { warn("Cannot set options: " + error); }
	);

	saveTimeData();
	updateIcon();
}

// Cancel override for specified set
//
function cancelOverride(set) {
	//log("cancelOverride: " + set);

	if (!gGotOptions || set < 1 || set > gNumSets) {
		return;
	}

	gOptions[`timedata${set}`][8] = 0;

	saveTimeData();
	updateIcon();
}

// Reset rollover time for set applicable to active tab
//
function resetRolloverTime() {
	//log("resetRolloverTime");

	if (!gGotOptions || !gActiveTabId) {
		return;
	}

	// Get block set for currently active time limit
	let set = gTabs[gActiveTabId].secsLeftSet;
	if (set) {
		// Reset rollover time for current period
		gOptions[`timedata${set}`][5] = 0;
	}
}

// Discard remaining time for set applicable to active tab
//
function discardRemainingTime() {
	//log("discardRemainingTime");

	if (!gGotOptions || !gActiveTabId) {
		return;
	}

	// Get block set for currently active time limit
	let set = gTabs[gActiveTabId].secsLeftSet;
	if (set) {
		// Set used time to time limit
		let limitMins = gOptions[`limitMins${set}`];
		gOptions[`timedata${set}`][3] = (limitMins * 60);
		// Reset rollover time for current period
		gOptions[`timedata${set}`][5] = 0;
		// Reset rollover time for next period
		gOptions[`timedata${set}`][6] = 0;
	}
}

// Open extension page (either create new tab or activate existing tab)
//
function openExtensionPage(url) {
	let fullURL = browser.runtime.getURL(url);

	browser.tabs.query({ url: fullURL }).then(onGot, onError);

	function onGot(tabs) {
		if (tabs.length > 0) {
			browser.tabs.update(tabs[0].id, { active: true });
		} else {
			browser.tabs.create({ url: fullURL });
		}
	}

	function onError(error) {
		browser.tabs.create({ url: fullURL });
	}
}

// Allow page blocked by delaying/password page
//
function allowBlockedPage(id, url, set, autoLoad) {
	//log("allowBlockedPage: " + id + " " + url + " " + set);

	if (!gGotOptions || set < 1 || set > gNumSets) {
		return;
	}

	// Get parsed URL for this page
	let parsedURL = getParsedURL(url);

	// Set parameters for allowing host
	let delayFirst = gOptions[`delayFirst${set}`];
	let delayAllowMins = gOptions[`delayAllowMins${set}`];
	gTabs[id].allowedHost = parsedURL.host;
	gTabs[id].allowedPath = delayFirst ? null : parsedURL.path;
	gTabs[id].allowedSet = set;
	if (delayAllowMins) {
		// Calculate end time for allowing access
		let now = Math.floor(Date.now() / 1000) + (gClockOffset * 60);
		gTabs[id].allowedEndTime = now + (delayAllowMins * 60);
	} else {
		// No end time for allowing access
		gTabs[id].allowedEndTime = 0;
	}

	if (autoLoad) {
		// Redirect page
		browser.tabs.update(id, { url: url });
	}
}

// Add site to block set
//
function addSiteToSet(url, set, includePath) {
	//log("addSiteToSet: " + url + " " + set + " " + includePath);

	if (!gGotOptions || set < 1 || set > gNumSets || !/^http/i.test(url)) {
		return;
	}

	// Get parsed URL for this page
	let parsedURL = getParsedURL(url);

	// Get sites for this set
	let sites = gOptions[`sites${set}`];

	// Add site if not already included
	let site = parsedURL.host.replace(/^www\./, "");
	if (includePath) {
		site += parsedURL.path; // include full path to page
	}
	let patterns = sites.split(/\s+/);
	if (patterns.indexOf(site) < 0) {
		// Get clean list of sites including new one
		patterns.push(site);
		sites = cleanSites(patterns.join(" "));

		// Get regular expressions to match sites
		let regexps = getRegExpSites(sites, gOptions["matchSubdomains"]);

		// Update options
		gOptions[`sites${set}`] = sites;
		gOptions[`blockRE${set}`] = regexps.block;
		gOptions[`allowRE${set}`] = regexps.allow;
		gOptions[`referRE${set}`] = regexps.refer;
		gOptions[`keywordRE${set}`] = regexps.keyword;

		createRegExps();

		// Save updated options to storage
		let options = {};
		options[`sites${set}`] = sites;
		options[`blockRE${set}`] = regexps.block;
		options[`allowRE${set}`] = regexps.allow;
		options[`referRE${set}`] = regexps.refer;
		options[`keywordRE${set}`] = regexps.keyword;
		gStorage.set(options).catch(
			function (error) { warn("Cannot set options: " + error); }
		);
	}
}

// Add list of sites to block set
//
function addSitesToSet(siteList, set) {
	//log("addSitesToSet: " + set);

	if (!gGotOptions || set < 1 || set > gNumSets) {
		return;
	}

	// Get sites for this set
	let sites = gOptions[`sites${set}`];

	// Get keyword info
	let keywordRE = gOptions[`keywordRE${set}`];
	let allowKeywords = gOptions[`allowKeywords${set}`];

	// Add sites to list
	let patterns = sites.split(/\s+/);
	for (let site of siteList.split(/\s+/)) {
		let firstChar = site.charAt(0);
		// Add item only if not exception and not already in list
		if (firstChar != "+" && patterns.indexOf(site) < 0) {
			// Add keywords only if keywords already there (and not as allow-condition)
			if (firstChar != "~" || (keywordRE && !allowKeywords)) {
				patterns.push(site);
			}
		}
	}

	// Get clean list of sites
	sites = cleanSites(patterns.join(" "));

	// Get regular expressions to match sites
	let regexps = getRegExpSites(sites, gOptions["matchSubdomains"]);

	// Update options
	gOptions[`sites${set}`] = sites;
	gOptions[`blockRE${set}`] = regexps.block;
	gOptions[`allowRE${set}`] = regexps.allow;
	gOptions[`referRE${set}`] = regexps.refer;
	gOptions[`keywordRE${set}`] = regexps.keyword;

	createRegExps();

	// Save updated options to storage
	let options = {};
	options[`sites${set}`] = sites;
	options[`blockRE${set}`] = regexps.block;
	options[`allowRE${set}`] = regexps.allow;
	options[`referRE${set}`] = regexps.refer;
	options[`keywordRE${set}`] = regexps.keyword;
	gStorage.set(options).catch(
		function (error) { warn("Cannot set options: " + error); }
	);
}

/*** EVENT HANDLERS BEGIN HERE ***/

function handleMenuClick(info, tab) {
	let id = info.menuItemId;
	if (id == "options") {
		browser.runtime.openOptionsPage();
	} else if (id == "lockdown") {
		openExtensionPage("lockdown.html");
	} else if (id == "override") {
		openExtensionPage("override.html");
	} else if (id == "stats") {
		openExtensionPage("stats.html");
	} else if (id.startsWith("addSite-")) {
		addSiteToSet(info.pageUrl, id.substr(8), false);
	} else if (id.startsWith("addPage-")) {
		addSiteToSet(info.pageUrl, id.substr(8), true);
	}
}

function handleCommand(command) {
	//log("handleCommand: " + command);

	switch(command) {

		case "lb-options":
			browser.runtime.openOptionsPage();
			break;

		case "lb-statistics":
			openExtensionPage("stats.html");
			break;

		case "lb-lockdown":
			openExtensionPage("lockdown.html");
			break;

		case "lb-override":
			openExtensionPage("override.html");
			break;

		case "lb-cancel-override":
			// Cancel override for all sets
			for (let set = 1; set <= gNumSets; set++) {
				cancelOverride(set);
			}
			break;

		case "lb-add-sites":
			openExtensionPage("add-sites.html");
			break;

		case "lb-reset-rollover":
			resetRolloverTime();
			break;

		case "lb-discard-time":
			discardRemainingTime();
			break;

	}
}

function handleMessage(message, sender, sendResponse) {
	if (!sender) {
		warn("No sender!");
		return;
	}

	//log("handleMessage: " + sender.tab.id + " " + message.type);

	switch (message.type) {

		case "add-sites":
			// Add sites to block set
			addSitesToSet(message.sites, message.set);
			break;

		case "blocked":
			// Block info requested by blocking page
			let info = createBlockInfo(sender.tab.id, sender.url);
			sendResponse(info);
			break;

		case "close":
			// Close tab requested
			browser.tabs.remove(sender.tab.id);
			break;

		case "delayed":
			// Delaying page countdown completed
			allowBlockedPage(sender.tab.id,
					message.blockedURL,
					message.blockedSet,
					gOptions[`delayAutoLoad${message.blockedSet}`]);
			break;

		case "discard-time":
			// Discard remaining time
			discardRemainingTime();
			break;

		case "focus":
			// Tab focus event received
			gTabs[sender.tab.id].focused = message.focus;
			break;

		case "loaded":
			// Register that content script has been loaded
			gTabs[sender.tab.id].loaded = true;
			gTabs[sender.tab.id].loadedTime = Date.now();
			gTabs[sender.tab.id].url = getCleanURL(message.url);
			break;

		case "lockdown":
			if (!message.endTime) {
				// Lockdown canceled
				cancelLockdown(message.set);
			} else {
				// Lockdown requested
				applyLockdown(message.set, message.endTime);
			}
			break;

		case "options":
			// Options updated
			retrieveOptions(true);
			reorderTimeData(message.ordering);
			break;

		case "override":
			// Override requested
			if (!message.endTime) {
				// Override canceled
				if (message.set) {
					cancelOverride(message.set);
				} else {
					// Cancel all overrides if no set specified
					for (let set = 1; set <= gNumSets; set++) {
						cancelOverride(set);
					}
				}
			} else {
				// Override requested
				applyOverride(message.set, message.endTime, message.countLimit);
			}
			break;

		case "password":
			// Password successfully entered
			allowBlockedPage(sender.tab.id,
					message.blockedURL,
					message.blockedSet,
					true);
			break;

		case "referrer":
			// URL of referring page received
			gTabs[sender.tab.id].referrer = message.referrer;
			break;

		case "reset-rollover":
			// Reset rollover time
			resetRolloverTime();
			break;

		case "restart":
			// Restart time data requested by statistics page
			restartTimeData(message.set);
			sendResponse();
			break;

	}
}

function handleTabCreated(tab) {
	//log("handleTabCreated: " + tab.id);

	initTab(tab.id);

	if (tab.openerTabId) {
		// Inherit properties from opener tab
		gTabs[tab.id].allowedHost = gTabs[tab.openerTabId].allowedHost;
		gTabs[tab.id].allowedPath = gTabs[tab.openerTabId].allowedPath;
		gTabs[tab.id].allowedSet = gTabs[tab.openerTabId].allowedSet;
		gTabs[tab.id].allowedEndTime = gTabs[tab.openerTabId].allowedEndTime;
	}
}

function handleTabUpdated(tabId, changeInfo, tab) {
	//log("handleTabUpdated: " + tabId);

	initTab(tabId);

	if (!gGotOptions) {
		return;
	}

	let focus = tab.active && (gAllFocused || !gFocusWindowId || tab.windowId == gFocusWindowId)
			&& (!gIsAndroid || !gUseDocFocus || gTabs[tab.id].focused);

	gTabs[tab.id].incog = tab.incognito;
	gTabs[tab.id].audible = tab.audible;

	if (changeInfo.url) {
		gTabs[tabId].url = getCleanURL(changeInfo.url);
	}

	if (changeInfo.status && changeInfo.status == "complete") {
		clockPageTime(tab.id, true, focus);

		// Check tab to see if page should be blocked
		let blocked = checkTab(tab.id, false, false);

		if (!blocked && tab.active) {
			updateTimer(tab.id);
		}
	}
}

function handleTabActivated(activeInfo) {
	let tabId = activeInfo.tabId;
	//log("handleTabActivated: " + tabId);

	gActiveTabId = tabId;
	gPrevActiveTabId = activeInfo.previousTabId;

	initTab(tabId);

	gTabs[tabId].focused = true;

	if (!gGotOptions) {
		return;
	}

	if (gOptions["processActiveTabs"]) {
		// Process all tabs to ensure time counted correctly
		processTabs(false);
		return;
	}

	let focus = (gAllFocused || !gFocusWindowId || activeInfo.windowId == gFocusWindowId);

	clockPageTime(tabId, true, focus);
	updateTimer(tabId);
}

function handleTabRemoved(tabId, removeInfo) {
	//log("handleTabRemoved: " + tabId);

	if (!gGotOptions) {
		return;
	}

	clockPageTime(tabId, false, false);

	// If extension page closed, activate previously active tab
	if (gTabs[tabId] && gTabs[tabId].url.startsWith(EXTENSION_URL)) {
		browser.tabs.update(gPrevActiveTabId, { active: true });
	}

	if (gTabs[tabId]) {
		delete gTabs[tabId];
	}
}

function handleBeforeNavigate(navDetails) {
	let tabId = navDetails.tabId;
	//log("handleBeforeNavigate: " + tabId);

	initTab(tabId);

	if (!gGotOptions) {
		return;
	}

	clockPageTime(tabId, false, false);

	if (navDetails.frameId == 0) {
		gTabs[tabId].loaded = false
		gTabs[tabId].url = getCleanURL(navDetails.url);

		// Check tab to see if page should be blocked
		let blocked = checkTab(tabId, true, false);
	}
}

function handleWinFocused(winId) {
	//log("handleWinFocused: " + winId);

	gFocusWindowId = winId;
}

function onInterval() {
	//log("onInterval");

	if (!gGotOptions) {
		retrieveOptions();
	} else {
		processTabs(gOptions["processActiveTabs"]);
		updateIcon();

		if (++gSaveSecsCount >= gOptions["saveSecs"]) {
			saveTimeData();
			gSaveSecsCount = 0;
		}
	}
}

function onAlarm(alarmInfo) {
	//log("onAlarm: " + alarmInfo.name);
}

/*** STARTUP CODE BEGINS HERE ***/

browser.runtime.getPlatformInfo().then(
	function (info) { gIsAndroid = (info.os == "android"); }
);

let localePath = browser.i18n.getMessage("localePath");
browser.action.setPopup({ popup: localePath + "popup.html" });

if (browser.menus) {
	browser.menus.onClicked.addListener(handleMenuClick);
}

if (browser.commands) {
	browser.commands.onCommand.addListener(handleCommand);
}

browser.runtime.onMessage.addListener(handleMessage);

browser.tabs.onCreated.addListener(handleTabCreated);
browser.tabs.onUpdated.addListener(handleTabUpdated);
browser.tabs.onActivated.addListener(handleTabActivated);
browser.tabs.onRemoved.addListener(handleTabRemoved);

browser.webNavigation.onBeforeNavigate.addListener(handleBeforeNavigate);

if (browser.windows) {
	browser.windows.onFocusChanged.addListener(handleWinFocused);
}

gTickerID = window.setInterval(onInterval, gTickerSecs * 1000);

// Use alarms to keep background script alive and ticker ticking...
let now = Date.now();
for (let alarm = 1; alarm <= 6; alarm++) {
	let alarmInfo = {
		when: now + (alarm * 10000),
		periodInMinutes: 1
	};
	browser.alarms.create(`Alarm${alarm}`, alarmInfo);
}
browser.alarms.onAlarm.addListener(onAlarm);
