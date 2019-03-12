/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const TICK_TIME = 1000; // update every second

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

var gStorage = browser.storage.local;
var gIsAndroid = false;
var gGotOptions = false;
var gOptions = {};
var gTabs = [];
var gSetCounted = [];
var gSetTouched = [];
var gRegExps = [];
var gFocusWindowId = 0;
var gOverrideIcon = false;
var gSaveSecsCount = 0;

// Create (precompile) regular expressions
//
function createRegExps() {
	// Create new array if necessary
	if (!gRegExps || gRegExps.length != NUM_SETS) {
		gRegExps = [];
		for (let set = 1; set <= NUM_SETS; set++) {
			gRegExps.push({ block: null, allow: null, keyword: null });
		}
	}

	// Create new RegExp objects
	for (let set = 1; set <= NUM_SETS; set++) {
		let blockRE = gOptions[`regexpBlock${set}`] || gOptions[`blockRE${set}`];
		gRegExps[set - 1].block = blockRE ? new RegExp(blockRE, "i") : null;

		let allowRE = gOptions[`regexpAllow${set}`] || gOptions[`allowRE${set}`];
		gRegExps[set - 1].allow = allowRE ? new RegExp(allowRE, "i") : null;

		let keywordRE = gOptions[`keywordRE${set}`];
		gRegExps[set - 1].keyword = keywordRE ? new RegExp(keywordRE, "i") : null;
	}
}

// Test URL against block/allow regular expressions
//
function testURL(pageURL, blockRE, allowRE) {
	return (blockRE && blockRE.test(pageURL)
			&& !(allowRE && allowRE.test(pageURL)));
}

// Refresh menus
//
function refreshMenus() {
	if (!browser.menus) {
		return; // no support for menus!
	}

	browser.menus.removeAll();

	let context = gOptions["contextMenu"] ? "all" : "browser_action";
	let contexts = gOptions["toolsMenu"] ? [context, "tools_menu"] : [context];

	// Options
	browser.menus.create({
		id: "options",
		title: "Options",
		contexts: contexts
	});

	// Lockdown
	browser.menus.create({
		id: "lockdown",
		title: "Lockdown",
		contexts: contexts
	});

	// Override
	browser.menus.create({
		id: "override",
		title: "Override",
		contexts: contexts
	});

	// Statistics
	browser.menus.create({
		id: "stats",
		title: "Statistics",
		contexts: contexts
	});

	browser.menus.create({
		type: "separator",
		contexts: [context] // never in tools menu
	});

	// Add Site
	browser.menus.create({
		id: "addSite",
		title: "Add Site",
		contexts: [context] // never in tools menu
	});

	// Add Site submenu
	for (let set = 1; set <= NUM_SETS; set++) {
		let title = `Add Site to Block Set ${set}`;
		let setName = gOptions[`setName${set}`];
		if (setName) {
			title += ` (${setName})`;
		}
		browser.menus.create({
			id: `addSite-${set}`,
			parentId: "addSite",
			title: title,
			contexts: contexts
		});
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
		gSetCounted = Array(NUM_SETS).fill(false);
		gSetTouched = Array(NUM_SETS).fill(false);
		createRegExps();
		refreshMenus();
		loadSiteLists();
		updateIcon();
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

	for (let set = 1; set <= NUM_SETS; set++) {
		// Get sites for block set from HTTP source (if specified)
		let sitesURL = gOptions[`sitesURL${set}`];
		if (sitesURL) {
			sitesURL = sitesURL.replace(/\$S/, set).replace(/\$T/, time);
			try {
				let req = new XMLHttpRequest();
				req.set = set;
				req.open("GET", sitesURL, true);
				req.overrideMimeType("text/plain");
				req.onload = onLoad;
				req.send();
			} catch (error) {
				warn("Cannot load sites from URL: " + sitesURL);
			}
		}
	}

	function onLoad(event) {
		let req = event.target;
		if (req.readyState == XMLHttpRequest.DONE && req.status == 200) {
			let set = req.set;
			let sites = req.responseText;
			sites = sites.replace(/\s+/g, " ").replace(/(^ +)|( +$)|(\w+:\/+)/g, "");
			sites = sites.split(" ").sort().join(" "); // sort alphabetically

			// Get regular expressions to match sites
			let regexps = getRegExpSites(sites, gOptions["matchSubdomains"]);

			// Update options
			gOptions[`sites${set}`] = sites;
			gOptions[`blockRE${set}`] = regexps.block;
			gOptions[`allowRE${set}`] = regexps.allow;
			gOptions[`keywordRE${set}`] = regexps.keyword;

			createRegExps();

			// Save updated options to local storage
			let options = {};
			options[`sites${set}`] = sites;
			options[`blockRE${set}`] = regexps.block;
			options[`allowRE${set}`] = regexps.allow;
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
	for (let set = 1; set <= NUM_SETS; set++) {
		if (gSetTouched[set - 1]) {
			options[`timedata${set}`] = gOptions[`timedata${set}`];
			touched = true;
		}
	}
	if (touched) {
		gStorage.set(options).catch(
			function (error) { warn("Cannot save time data: " + error); }
		);
	}

	gSetTouched = Array(NUM_SETS).fill(false);
}

// Restart time data
//
function restartTimeData(set) {
	//log("restartTimeData: " + set);

	if (!gGotOptions) {
		return;
	}

	// Get current time in seconds
	let now = Math.floor(Date.now() / 1000);

	if (!set) {
		for (set = 1; set <= NUM_SETS; set++) {
			gOptions[`timedata${set}`][0] = now;
			gOptions[`timedata${set}`][1] = 0;
			gSetTouched[set - 1] = true;
		}
	} else {
		gOptions[`timedata${set}`][0] = now;
		gOptions[`timedata${set}`][1] = 0;
		gSetTouched[set - 1] = true;
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

	gSetCounted.fill(false);

	if (active) {
		// Process only active tabs
		browser.tabs.query({ active: true }).then(onGot, onError);
	} else {
		// Process all tabs
		browser.tabs.query({}).then(onGot, onError);
	}

	function onGot(tabs) {
		for (let tab of tabs) {
			let focus = tab.active && (!gFocusWindowId || tab.windowId == gFocusWindowId);

			// Force update of time spent on this page
			clockPageTime(tab.id, false, false);
			clockPageTime(tab.id, true, focus);

			let blocked = checkTab(tab.id, tab.url, true);

			if (!blocked) {
				updateTimer(tab.id);
			}
		}
	}

	function onError(error) {
		warn("Cannot get tabs: " + error);
	}
}

// Check the URL of a tab and applies block if necessary (returns true if blocked)
//
function checkTab(id, url, isRepeat) {
	//log("checkTab: " + id + " " + url + " " + isRepeat);

	function isSameHost(host1, host2) {
		return (host1 == host2)
				|| (host1 == "www." + host2)
				|| (host2 == "www." + host1);
	}

	// Quick exit for about:blank
	if (url == "about:blank") {
		return false; // not blocked
	}

	if (!gTabs[id]) {
		// Create object to track this tab
		gTabs[id] = { allowedHost: null, allowedPath: null };
	}

	// Quick exit for non-blockable URLs
	if (!/^(http|file|about)/i.test(url)) {
		gTabs[id].blockable = false;
		return false; // not blocked
	}

	gTabs[id].blockable = true;
	gTabs[id].url = url;

	// Get parsed URL for this page
	let parsedURL = getParsedURL(url);

	// Check for allowed host/path
	let ah = isSameHost(gTabs[id].allowedHost, parsedURL.host);
	let ap = !gTabs[id].allowedPath || (gTabs[id].allowedPath == parsedURL.path);
	if (ah && ap) {
		return false; // not blocked
	} else {
		gTabs[id].allowedHost = null;
		gTabs[id].allowedPath = null;
	}

	// Get current time/date
	let timedate = new Date();

	// Get current time in seconds
	let now = Math.floor(Date.now() / 1000);

	// Get override end time
	let overrideEndTime = gOptions["oret"];

	gTabs[id].secsLeft = Infinity;

	for (let set = 1; set <= NUM_SETS; set++) {
		// Get URL of page (possibly with hash part)
		let pageURL = parsedURL.page;
		let pageURLWithHash = parsedURL.page;
		if (parsedURL.hash != null) {
			pageURLWithHash +=  "#" + parsedURL.hash;
			if (/^!/.test(parsedURL.hash) || !gOptions[`ignoreHash${set}`]) {
				pageURL = pageURLWithHash;
			}
		}

		// Get regular expressions for matching sites to block/allow
		let blockRE = gRegExps[set - 1].block;
		if (!blockRE) continue; // no block for this set
		let allowRE = gRegExps[set - 1].allow;
		let keywordRE = gRegExps[set - 1].keyword;

		// Get options for preventing access to about:addons and about:support
		let prevAddons = gOptions[`prevAddons${set}`];
		let prevSupport = gOptions[`prevSupport${set}`];

		// Test URL against block/allow regular expressions
		if (testURL(pageURL, blockRE, allowRE)
				|| (prevAddons && /^about:addons/i.test(pageURL))
				|| (prevSupport && /^about:support/i.test(pageURL))) {
			// Get options for this set
			let timedata = gOptions[`timedata${set}`];
			let times = gOptions[`times${set}`];
			let minPeriods = getMinPeriods(times);
			let limitMins = gOptions[`limitMins${set}`];
			let limitPeriod = gOptions[`limitPeriod${set}`];
			let limitOffset = gOptions[`limitOffset${set}`];
			let periodStart = getTimePeriodStart(now, limitPeriod, limitOffset);
			let conjMode = gOptions[`conjMode${set}`];
			let days = gOptions[`days${set}`];
			let blockURL = gOptions[`blockURL${set}`];
			let activeBlock = gOptions[`activeBlock${set}`];
			let allowOverride = gOptions[`allowOverride${set}`];
			let showTimer = gOptions[`showTimer${set}`];

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
				secsLeftBeforeLimit = limitMins * 60;
				if (timedata[2] == periodStart) {
					let secs = secsLeftBeforeLimit - timedata[3];
					secsLeftBeforeLimit = Math.max(0, secs);
				}
			}

			let withinTimePeriods = (secsLeftBeforePeriod == 0);
			let afterTimeLimit = (secsLeftBeforeLimit == 0);

			// Check lockdown condition
			let lockdown = (timedata[4] > now);

			// Check override condition
			let override = (overrideEndTime > now) && allowOverride;

			// Determine whether this page should now be blocked
			let doBlock = lockdown
					|| (!conjMode && (withinTimePeriods || afterTimeLimit))
					|| (conjMode && (withinTimePeriods && afterTimeLimit));

			// Redirect page if all relevant block conditions are fulfilled
			if (!override && doBlock && (!isRepeat || activeBlock)) {
				// Get final URL for block page
				blockURL = blockURL.replace(/\$S/g, set).replace(/\$U/g, pageURLWithHash);

				if (keywordRE) {
					// Check for keyword(s) before blocking
					let message = {
						type: "keyword",
						keywordRE: keywordRE
					};
					browser.tabs.sendMessage(id, message).then(
						function (keyword) {
							if (keyword) {
								// Redirect page
								browser.tabs.update(id, { url: blockURL });
							}
						},
						function (error) {}
					);
				} else {
					// Redirect page
					browser.tabs.update(id, { url: blockURL });

					return true; // blocked
				}
			}

			// Update seconds left before block
			let secsLeft = conjMode
					? (secsLeftBeforePeriod + secsLeftBeforeLimit)
					: Math.min(secsLeftBeforePeriod, secsLeftBeforeLimit);
			if (override) {
				secsLeft = Math.max(secsLeft, overrideEndTime - now);
			}
			if (showTimer && secsLeft < gTabs[id].secsLeft) {
				gTabs[id].secsLeft = secsLeft;
				gTabs[id].secsLeftSet = set;
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
	if (!gTabs[id] || !gTabs[id].blockable) {
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
			if (/^(http|file)/i.test(gTabs[id].url)) {
				// Calculate seconds spent on this page (while open)
				secsOpen = ((time - gTabs[id].openTime) / 1000);
			}

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
			if (/^(http|file)/i.test(gTabs[id].url)) {
				// Calculate seconds spent on this page (while focused)
				secsFocus = ((time - gTabs[id].focusTime) / 1000);
			}

			gTabs[id].focusTime = undefined;
		}
	}

	// Update time data if necessary
	if (secsOpen > 0 || secsFocus > 0) {
		updateTimeData(gTabs[id].url, secsOpen, secsFocus);
	}
}

// Update time data for specified page
//
function updateTimeData(url, secsOpen, secsFocus) {
	//log("updateTimeData: " + url + " " + secsOpen + " " + secsFocus);

	// Get parsed URL for this page
	let parsedURL = getParsedURL(url);
	let pageURL = parsedURL.page;

	// Get current time/date
	let timedate = new Date();

	// Get current time in seconds
	let now = Math.floor(Date.now() / 1000);

	for (let set = 1; set <= NUM_SETS; set++) {
		// Get regular expressions for matching sites to block/allow
		let blockRE = gRegExps[set - 1].block;
		if (!blockRE) continue; // no block for this set
		let allowRE = gRegExps[set - 1].allow;

		// Test URL against block/allow regular expressions
		if (testURL(pageURL, blockRE, allowRE)) {
			// Get options for this set
			let timedata = gOptions[`timedata${set}`];
			let countFocus = gOptions[`countFocus${set}`];
			let times = gOptions[`times${set}`];
			let minPeriods = getMinPeriods(times);
			let limitPeriod = gOptions[`limitPeriod${set}`];
			let limitOffset = gOptions[`limitOffset${set}`];
			let periodStart = getTimePeriodStart(now, limitPeriod, limitOffset);
			let conjMode = gOptions[`conjMode${set}`];
			let days = gOptions[`days${set}`];

			// Avoid overcounting time for non-focused tabs
			if (!countFocus && gSetCounted[set - 1]) {
				continue;
			} else {
				gSetCounted[set - 1] = true;
			}

			// Reset time data if currently invalid
			if (!Array.isArray(timedata) || timedata.length != 5) {
				timedata = [now, 0, 0, 0, 0];
			}

			// Get number of seconds spent on page (focused or open)
			let secsSpent = countFocus ? secsFocus : secsOpen;

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
			}

			// Update time data for this set
			gOptions[`timedata${set}`] = timedata;
			gSetTouched[set - 1] = true;
		}
	}
}

// Update timer
//
function updateTimer(id) {
	if (!gTabs[id] || !gTabs[id].blockable || /^about/i.test(gTabs[id].url)) {
		return;
	}

	// Send message to tab
	let secsLeft = gTabs[id].secsLeft;
	let message = {
		type: "timer",
		size: gOptions["timerSize"],
		location: gOptions["timerLocation"]
	};
	if (!gOptions["timerVisible"] || secsLeft == undefined || secsLeft == Infinity) {
		message.text = null; // hide timer
	} else {
		message.text = formatTime(secsLeft); // show timer with time left
	}
	browser.tabs.sendMessage(id, message).catch(function (error) {});

	// Set tooltip
	if (!gIsAndroid) {
		if (secsLeft == undefined || secsLeft == Infinity) {
			browser.browserAction.setTitle({ title: null, tabId: id });
		} else {
			let title = "LeechBlock [" + formatTime(secsLeft) + "]"
			browser.browserAction.setTitle({ title: title, tabId: id });
		}
	}

	// Set badge timer (if option selected)
	if (!gIsAndroid && gOptions["timerBadge"] && secsLeft < 600) {
		let m = Math.floor(secsLeft / 60);
		let s = Math.floor(secsLeft) % 60;
		let text = m + ":" + ((s < 10) ? "0" + s : s);
		browser.browserAction.setBadgeBackgroundColor({ color: "#666" });
		browser.browserAction.setBadgeText({ text: text, tabId: id });
	} else {
		browser.browserAction.setBadgeText({ text: "", tabId: id });
	}
}

// Update button icon
//
function updateIcon() {
	if (gIsAndroid) {
		return; // icon not supported yet
	}

	// Get current time in seconds
	let now = Math.floor(Date.now() / 1000);

	// Get override end time
	let overrideEndTime = gOptions["oret"];

	// Change icon only if override status has changed
	if (!gOverrideIcon && overrideEndTime > now) {
		browser.browserAction.setIcon({ path: OVERRIDE_ICON });
		gOverrideIcon = true;
	} else if (gOverrideIcon && overrideEndTime <= now) {
		browser.browserAction.setIcon({ path: DEFAULT_ICON });
		gOverrideIcon = false;
	}
}

// Create info for blocking/delaying page
//
function createBlockInfo(url) {
	// Get theme
	let theme = gOptions["theme"];

	// Get parsed URL
	let parsedURL = getParsedURL(url);
	let pageURL = parsedURL.page;

	if (parsedURL.args == null || parsedURL.args.length < 2) {
		warn("Cannot create block info: not enough arguments in URL.");
		return { theme: theme };
	}

	// Get block set and URL (including hash part) of blocked page
	let blockedSet = parsedURL.args.shift();
	let blockedSetName = gOptions[`setName${blockedSet}`];
	let blockedURL = parsedURL.query.substring(3); // retains original separators (& or ;)
	if (parsedURL.hash != null) {
		blockedURL += "#" + parsedURL.hash;
	}

	// Get unblock time for block set
	let unblockTime = getUnblockTime(blockedSet);
	if (unblockTime != null) {
		// Convert to string
		if (unblockTime.getDate() == new Date().getDate()) {
			// Same day: show time only
			unblockTime = unblockTime.toLocaleTimeString();
		} else {
			// Different day: show date and time
			unblockTime = unblockTime.toLocaleString();
		}
	}

	// Get delaying time for block set
	let delaySecs = gOptions[`delaySecs${blockedSet}`];

	// Get reloading time (if specified)
	let reloadSecs = gOptions[`reloadSecs${blockedSet}`];

	return {
		theme: theme,
		blockedSet: blockedSet,
		blockedSetName: blockedSetName,
		blockedURL: blockedURL,
		unblockTime: unblockTime,
		delaySecs: delaySecs,
		reloadSecs: reloadSecs
	};
}

// Return time when blocked sites will be unblocked (as Date object)
//
function getUnblockTime(set) {
	// Check for invalid set number
	if (set < 1 || set > NUM_SETS) {
		return null;
	}

	// Get current time/date
	let timedate = new Date();
	
	// Get current time in seconds
	let now = Math.floor(Date.now() / 1000);

	// Get options for this set
	let timedata = gOptions[`timedata${set}`];
	let times = gOptions[`times${set}`];
	let minPeriods = getMinPeriods(times);
	let limitMins = gOptions[`limitMins${set}`];
	let limitPeriod = gOptions[`limitPeriod${set}`];
	let limitOffset = gOptions[`limitOffset${set}`];
	let periodStart = getTimePeriodStart(now, limitPeriod, limitOffset);
	let conjMode = gOptions[`conjMode${set}`];
	let days = gOptions[`days${set}`];

	// Check for valid time data
	if (!Array.isArray(timedata) || timedata.length != 5) {
		return null;
	}

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
			let afterTimeLimit = (timedata[2] == periodStart)
					&& (timedata[3] >= (limitMins * 60));

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
		}
	}

	return null;
}

// Apply lockdown for specified set
//
function applyLockdown(set, endTime) {
	//log("applyLockdown: " + set + " " + endTime);

	if (!gGotOptions) {
		return;
	}

	// Apply lockdown only if it doesn't reduce any current lockdown
	if (endTime > gOptions[`timedata${set}`][4]) {
		gOptions[`timedata${set}`][4] = endTime;
		gSetTouched[set - 1] = true;
	}

	saveTimeData();
}

// Cancel lockdown for specified set
//
function cancelLockdown(set) {
	//log("cancelLockdown: " + set);

	if (!gGotOptions) {
		return;
	}

	gOptions[`timedata${set}`][4] = 0;
	gSetTouched[set - 1] = true;

	saveTimeData();
}

// Apply override
//
function applyOverride() {
	//log("applyOverride");

	if (!gGotOptions) {
		return;
	}

	let overrideMins = gOptions["orm"];
	if (overrideMins) {
		// Calculate end time
		let overrideEndTime = Math.floor(Date.now() / 1000) + (overrideMins * 60);

		// Update option
		gOptions["oret"] = overrideEndTime;

		// Save updated option to local storage
		let options = {};
		options["oret"] = overrideEndTime;
		gStorage.set(options).catch(
			function (error) { warn("Cannot set options: " + error); }
		);

		updateIcon();
	}
}

// Open extension page (either create new tab or activate existing tab)
//
function openExtensionPage(url) {
	let fullURL = browser.extension.getURL(url);

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

// Open page blocked by delaying page
//
function openDelayedPage(id, url, set) {
	//log("openDelayedPage: " + id + " " + url);

	// Get parsed URL for this page
	let parsedURL = getParsedURL(url);

	// Set parameters for allowing host
	gTabs[id].allowedHost = parsedURL.host;
	if (!gOptions[`delayFirst${set}`]) {
		gTabs[id].allowedPath = parsedURL.path;
	}

	// Redirect page
	browser.tabs.update(id, { url: url });
}

// Add site to block set
//
function addSiteToSet(url, set) {
	//log("addSiteToSet: " + url + " " + set);

	if (!/^http/i.test(url) || set < 1 || set > NUM_SETS) {
		return;
	}

	if (!gGotOptions) {
		return;
	}

	// Get parsed URL for this page
	let parsedURL = getParsedURL(url);

	// Get sites for this set
	let sites = gOptions[`sites${set}`];

	// Add site if not already included
	let site = parsedURL.host.replace(/^www\./, "");
	let patterns = sites.split(/\s+/);
	if (patterns.indexOf(site) < 0) {
		// Get sorted list of sites including new one
		patterns.push(site);
		sites = patterns.sort().join(" ").replace(/(^ +)|( +$)/g, "");

		// Get regular expressions to match sites
		let regexps = getRegExpSites(sites, gOptions["matchSubdomains"]);

		// Update options
		gOptions[`sites${set}`] = sites;
		gOptions[`blockRE${set}`] = regexps.block;
		gOptions[`allowRE${set}`] = regexps.allow;
		gOptions[`keywordRE${set}`] = regexps.keyword;

		createRegExps();

		// Save updated options to local storage
		let options = {};
		options[`sites${set}`] = sites;
		options[`blockRE${set}`] = regexps.block;
		options[`allowRE${set}`] = regexps.allow;
		options[`keywordRE${set}`] = regexps.keyword;
		gStorage.set(options).catch(
			function (error) { warn("Cannot set options: " + error); }
		);
	}	
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
		addSiteToSet(info.pageUrl, id.substr(8));
	}
}

function handleMessage(message, sender, sendResponse) {
	if (!sender) {
		warn("No sender!");
		return;
	}

	//log("handleMessage: " + sender.tab.id + " " + message.type);

	if (message.type == "close") {
		// Close tab requested
		browser.tabs.remove(sender.tab.id);
	} else if (message.type == "options") {
		// Options updated
		retrieveOptions(true);
	} else if (message.type == "lockdown") {
		if (!message.endTime) {
			// Lockdown canceled
			cancelLockdown(message.set);
		} else {
			// Lockdown requested
			applyLockdown(message.set, message.endTime);
		}
	} else if (message.type == "override") {
		// Override requested
		applyOverride();
	} else if (message.type == "restart") {
		// Restart time data requested by statistics page
		restartTimeData(message.set);
		sendResponse();
	} else if (message.type == "blocked") {
		// Block info requested by blocking/delaying page
		let info = createBlockInfo(sender.url);
		sendResponse(info);
	} else if (message.type == "delayed") {
		// Redirect requested by delaying page
		openDelayedPage(sender.tab.id, message.blockedURL, message.blockedSet);
	}
}

function handleTabCreated(tab) {
	//log("handleTabCreated: " + tab.id);
}

function handleTabUpdated(tabId, changeInfo, tab) {
	//log("handleTabUpdated: " + tabId);

	if (!gGotOptions) {
		return;
	}

	let focus = tab.active && (!gFocusWindowId || tab.windowId == gFocusWindowId);

	if (changeInfo.status && changeInfo.status == "complete") {
		clockPageTime(tab.id, true, focus);

		let blocked = checkTab(tab.id, tab.url, false);

		if (!blocked) {
			updateTimer(tab.id);
		}
	}
}

function handleTabActivated(activeInfo) {
	//log("handleTabActivated: " + activeInfo.tabId);

	if (!gGotOptions) {
		return;
	}

	if (gOptions["processActiveTabs"]) {
		// Process all tabs to ensure time counted correctly
		processTabs(false);
		return;
	}

	let focus = (!gFocusWindowId || activeInfo.windowId == gFocusWindowId);

	clockPageTime(activeInfo.tabId, true, focus);
	updateTimer(activeInfo.tabId);
}

function handleTabRemoved(tabId, removeInfo) {
	//log("handleTabRemoved: " + tabId);

	if (!gGotOptions) {
		return;
	}

	clockPageTime(tabId, false, false);
}

function handleBeforeNavigate(navDetails) {
	//log("handleBeforeNavigate: " + navDetails.tabId);

	if (!gGotOptions) {
		return;
	}

	clockPageTime(navDetails.tabId, false, false);

	if (navDetails.frameId == 0) {
		checkTab(navDetails.tabId, navDetails.url, false);
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

/*** STARTUP CODE BEGINS HERE ***/

browser.runtime.getPlatformInfo().then(
	function (info) { gIsAndroid = (info.os == "android"); }
);

if (browser.menus) {
	browser.menus.onClicked.addListener(handleMenuClick);
}

browser.runtime.onMessage.addListener(handleMessage);

//browser.tabs.onCreated.addListener(handleTabCreated);
browser.tabs.onUpdated.addListener(handleTabUpdated);
browser.tabs.onActivated.addListener(handleTabActivated);
browser.tabs.onRemoved.addListener(handleTabRemoved);

browser.webNavigation.onBeforeNavigate.addListener(handleBeforeNavigate);

if (browser.windows) {
	browser.windows.onFocusChanged.addListener(handleWinFocused);
}

window.setInterval(onInterval, TICK_TIME);
