/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const NUM_SETS = 6;
const ALL_DAY_TIMES = "0000-2400";
const DEFAULT_BLOCK_URL = "blocked.html?$S&$U";
const DELAYED_BLOCK_URL = "delayed.html?$S&$U";
const LEGACY_DEFAULT_BLOCK_URL = "chrome://leechblock/content/blocked.xhtml?$S&$U";
const LEGACY_DELAYED_BLOCK_URL = "chrome://leechblock/content/delayed.xhtml?$S&$U";
const DEFAULT_ICON = { 16: "icons/leechblock16.png", 32: "icons/leechblock32.png" };
const OVERRIDE_ICON = { 16: "icons/leechblock16o.png", 32: "icons/leechblock32o.png" };

const PARSE_URL = /^((([\w-]+):\/*(\w+(?::\w+)?@)?([\w-\.]+)(?::(\d*))?)([^\?#]*))(\?[^#]*)?(#.*)?$/;

function listObjectProperties(obj, name) {
	let list = "";
	for (let prop of Object.keys(obj).sort()) {
		list += `${name}.${prop}=${obj[prop]}\n`;
	}
	return list;
}

// Clean options
//
function cleanOptions(options) {
	for (let set = 1; set <= NUM_SETS; set++) {
		// Check types and set default values where needed
		if (typeof options[`setName${set}`] !== "string") {
			options[`setName${set}`] = "";
		}
		if (typeof options[`sites${set}`] !== "string") {
			options[`sites${set}`] = "";
		}
		if (typeof options[`times${set}`] !== "string") {
			options[`times${set}`] = "0900-1700";
		}
		if (typeof options[`limitMins${set}`] !== "string") {
			options[`limitMins${set}`] = "";
		}
		if (typeof options[`limitPeriod${set}`] !== "string") {
			options[`limitPeriod${set}`] = "";
		}
		if (typeof options[`conjMode${set}`] !== "boolean") {
			options[`conjMode${set}`] = false;
		}
		if (!Array.isArray(options[`days${set}`])) {
			options[`days${set}`] = [false, true, true, true, true, true, false];
		}
		if (typeof options[`blockURL${set}`] !== "string") {
			options[`blockURL${set}`] = DEFAULT_BLOCK_URL;
		}
		if (typeof options[`activeBlock${set}`] !== "boolean") {
			options[`activeBlock${set}`] = false;
		}
		if (typeof options[`countFocus${set}`] !== "boolean") {
			options[`countFocus${set}`] = true;
		}
		if (typeof options[`delayFirst${set}`] !== "boolean") {
			options[`delayFirst${set}`] = true;
		}
		if (typeof options[`delaySecs${set}`] !== "string") {
			options[`delaySecs${set}`] = "60";
		}
		if (typeof options[`allowOverride${set}`] !== "boolean") {
			options[`allowOverride${set}`] = true;
		}
		if (typeof options[`prevOpts${set}`] !== "boolean") {
			options[`prevOpts${set}`] = false;
		}
		if (typeof options[`prevAddons${set}`] !== "boolean") {
			options[`prevAddons${set}`] = false;
		}
		if (typeof options[`prevSupport${set}`] !== "boolean") {
			options[`prevSupport${set}`] = false;
		}
		if (typeof options[`sitesURL${set}`] !== "string") {
			options[`sitesURL${set}`] = "";
		}
		if (typeof options[`regexpBlock${set}`] !== "string") {
			options[`regexpBlock${set}`] = "";
		}
		if (typeof options[`regexpAllow${set}`] !== "string") {
			options[`regexpAllow${set}`] = "";
		}
		if (typeof options[`blockRE${set}`] !== "string") {
			options[`blockRE${set}`] = "";
		}
		if (typeof options[`allowRE${set}`] !== "string") {
			options[`allowRE${set}`] = "";
		}
		if (typeof options[`keywordRE${set}`] !== "string") {
			options[`keywordRE${set}`] = "";
		}
		if (typeof options[`ignoreHash${set}`] !== "boolean") {
			options[`ignoreHash${set}`] = true;
		}
		if (typeof options[`lockdown${set}`] !== "boolean") {
			options[`lockdown${set}`] = false;
		}

		// Update legacy values
		if (options[`blockURL${set}`] == LEGACY_DEFAULT_BLOCK_URL) {
			options[`blockURL${set}`] = DEFAULT_BLOCK_URL;
		}
		if (options[`blockURL${set}`] == LEGACY_DELAYED_BLOCK_URL) {
			options[`blockURL${set}`] = DELAYED_BLOCK_URL;
		}
	}

	// General options
	if (typeof options["oa"] !== "string") {
		options["oa"] = "0"; // default: no password or code
	}
	if (typeof options["password"] !== "string") {
		options["password"] = ""; // default: blank
	}
	if (typeof options["hpp"] !== "boolean") {
		options["hpp"] = true; // default: hidden
	}
	if (typeof options["timerVisible"] !== "boolean") {
		options["timerVisible"] = true; // default: visible
	}
	if (typeof options["timerSize"] !== "string") {
		options["timerSize"] = "1"; // default: medium
	}
	if (typeof options["timerLocation"] !== "string") {
		options["timerLocation"] = "0"; // default: top left
	}
	if (typeof options["timerBadge"] !== "boolean") {
		options["timerBadge"] = true; // default: enabled
	}
	if (typeof options["orm"] !== "string") {
		options["orm"] = ""; // default: no override
	}
	if (typeof options["ora"] !== "string") {
		options["ora"] = "0"; // default: no password or code
	}
	if (typeof options["warnSecs"] !== "string") {
		options["warnSecs"] = ""; // default: no warning
	}
	if (typeof options["warnImmediate"] !== "boolean") {
		options["warnImmediate"] = true; // default: warn only for immediate block
	}
	if (typeof options["contextMenu"] !== "boolean") {
		options["contextMenu"] = true; // default: enabled
	}
	if (typeof options["toolsMenu"] !== "boolean") {
		options["toolsMenu"] = true; // default: enabled
	}
	if (typeof options["matchSubdomains"] !== "boolean") {
		options["matchSubdomains"] = false; // default: disabled for backwards compatibility
	}
	if (typeof options["processActiveTabs"] !== "boolean") {
		options["processActiveTabs"] = false; // default: disabled for backwards compatibility
	}
	if (typeof options["lockdownHours"] !== "string") {
		options["lockdownHours"] = ""; // default: blank
	}
	if (typeof options["lockdownMins"] !== "string") {
		options["lockdownMins"] = ""; // default: blank
	}
}

// Clean time data
//
// timedata[0] = start time for statistics (secs since epoch)
// timedata[1] = total time spent on sites (secs)
// timedata[2] = start time for time limit period (secs since epoch)
// timedata[3] = time spent on sites during this limit period (secs)
// timedata[4] = end time for lockdown (secs since epoch)
//
function cleanTimeData(options) {
	for (let set = 1; set <= NUM_SETS; set++) {
		let timedata = options[`timedata${set}`];
		if (!Array.isArray(timedata) || timedata.length < 5) {
			timedata = [Math.floor(Date.now() / 1000), 0, 0, 0, 0];
		}
		options[`timedata${set}`] = timedata;
	}
}

// Return parsed URL (page address, arguments, and hash)
//
function getParsedURL(url) {
	let results = PARSE_URL.exec(url);
	if (results != null) {
		let page = results[1];
		let origin = results[2];
		let protocol = results[3];
		let userinfo = results[4];
		let host = results[5];
		let port = results[6];
		let path = results[7];
		let query = results[8];
		let fragment = results[9];
		return {
			pageNoArgs: page,
			page: (query == null) ? page : (page + query),
			origin: origin,
			protocol: protocol,
			host: host,
			path: path,
			query: query,
			args: (query == null) ? null : query.substring(1).split(/[;&]/),
			hash: (fragment == null) ? null : fragment.substring(1)
		};
	} else {
		warn("Cannot parse URL: " + url);
		return {
			pageNoArgs: null,
			page: null,
			origin: null,
			protocol: null,
			host: null,
			path: null,
			query: null,
			args: null,
			hash: null
		};
	}
}

// Create regular expressions for matching sites to block/allow
//
function getRegExpSites(sites, matchSubdomains) {
	if (!sites) {
		return {
			block: "",
			allow: "",
			keyword: ""
		};
	}

	let blockFiles = false;
	let allowFiles = false;

	let patterns = sites.split(/\s+/);
	let blocks = [];
	let allows = [];
	let keywords = [];
	for (let pattern of patterns) {
		if (pattern == "FILE") {
			blockFiles = true;
		} else if (pattern == "+FILE") {
			allowFiles = true;
		} else if (pattern.charAt(0) == "~") {
			// Add a keyword
			keywords.push(keywordToRegExp(pattern.substr(1)));
		} else if (pattern.charAt(0) == "+") {
			// Add a regexp to allow site(s) as exception(s)
			allows.push(patternToRegExp(pattern.substr(1), matchSubdomains));
		} else if (pattern.charAt(0) != "#") {
			// Add a regexp to block site(s)
			blocks.push(patternToRegExp(pattern, matchSubdomains));
		}
	}
	return {
		block: (blocks.length > 0)
				? "^" + (blockFiles ? "file:|" : "") + "(https?|file):\\/+(" + blocks.join("|") + ")"
				: (blockFiles ? "^file:" : ""),
		allow: (allows.length > 0)
				? "^" + (allowFiles ? "file:|" : "") + "(https?|file):\\/+(" + allows.join("|") + ")"
				: (allowFiles ? "^file:" : ""),
		keyword: (keywords.length > 0) ? keywords.join("|") : ""
	};
}

// Convert site pattern to regular expression
//
function patternToRegExp(pattern, matchSubdomains) {
	let special = /[\.\|\?\:\+\-\^\$\(\)\[\]\{\}\\]/g;
	let subdomains = matchSubdomains ? "([^/]*\\.)?" : "(www\\.)?"
	return subdomains + pattern
			.replace(special, "\\$&")			// fix special chars
			.replace(/^www\\\./, "")			// remove existing www prefix
			.replace(/\*\\\+/g, ".+")			// convert plus-wildcards
			.replace(/\*{2,}/g, ".{STAR}")		// convert super-wildcards
			.replace(/\*/g, "[^\\/]{STAR}")		// convert wildcards
			.replace(/{STAR}/g, "*");			// convert stars
}

// Convert keyword to regular expression
//
function keywordToRegExp(keyword) {
	let special = /[\.\|\?\:\+\-\^\$\(\)\[\]\{\}\\]/g;
	return "\\b" + keyword
			.replace(special, "\\$&")			// fix special chars
			.replace(/_+/g, "\\s+")				// convert underscores
			.replace(/\*+/, "\\S*")				// convert wildcards
			+ "\\b";
}

// Test URL against block/allow regular expressions
//
function testURL(pageURL, blockRE, allowRE) {
	return (blockRE && (new RegExp(blockRE, "i")).test(pageURL)
			&& !(allowRE && (new RegExp(allowRE, "i")).test(pageURL)));
}

// Check time periods format
//
function checkTimePeriodsFormat(times) {
	return (times == "") || /^[0-2]\d[0-5]\d-[0-2]\d[0-5]\d([, ]+[0-2]\d[0-5]\d-[0-2]\d[0-5]\d)*$/.test(times);
}

// Check positive integer format
//
function checkPosIntFormat(value) {
	return (value == "") || /^[1-9][0-9]*$/.test(value);
}

// Convert times to minute periods
//
function getMinPeriods(times) {
	let minPeriods = [];
	if (times) {
		let regexp = /^(\d\d)(\d\d)-(\d\d)(\d\d)$/;
		let periods = times.split(/[, ]+/);
		for (let period of periods) {
			let results = regexp.exec(period);
			if (results != null) {
				let minPeriod = {
					start: (parseInt(results[1], 10) * 60 + parseInt(results[2], 10)),
					end: (parseInt(results[3], 10) * 60 + parseInt(results[4], 10))
				};
				minPeriods.push(minPeriod);
			}
		}
	}
	return minPeriods;
}

// Clean time periods
//
function cleanTimePeriods(times) {
	// Convert to minute periods
	let minPeriods = getMinPeriods(times);
	if (minPeriods.length == 0) {
		return ""; // nothing to do
	}

	// Step 1: Fix any times > 2400
	for (let mp of minPeriods) {
		mp.start = Math.min(mp.start, 1440);
		mp.end = Math.min(mp.end, 1440);
	}		

	// Step 2: Remove any periods without +ve duration
	for (let i = 0; i < minPeriods.length; i++) {
		if (minPeriods[i].start >= minPeriods[i].end) {
			minPeriods.splice(i--, 1);
		}
	}

	// Step 3: Sort periods in order of start time
	minPeriods.sort(function (a, b) { return (a.start - b.start); });

	// Step 4: Combine overlapping periods
	for (let i = 0; i < (minPeriods.length - 1); i++) {
		let mp1 = minPeriods[i];
		let mp2 = minPeriods[i + 1];
		if (mp2.start <= mp1.end) {
			// Merge first period into second period (and back up index)
			mp2.start = mp1.start;
			mp2.end = Math.max(mp1.end, mp2.end);
			minPeriods.splice(i--, 1);
		}
	}

	// Convert back to string list of time periods
	let cleanTimes = [];
	for (let mp of minPeriods) {
		let h1 = Math.floor(mp.start / 60);
		let m1 = (mp.start % 60);
		let h2 = Math.floor(mp.end / 60);
		let m2 = (mp.end % 60);
		let period =
				((h1 < 10) ? "0" : "") + h1 +
				((m1 < 10) ? "0" : "") + m1 +
				"-" +
				((h2 < 10) ? "0" : "") + h2 +
				((m2 < 10) ? "0" : "") + m2;
		cleanTimes.push(period);
	}
	return cleanTimes.join(",");
}

// Calculate start of time period from current time and time limit period
//
function getTimePeriodStart(now, limitPeriod) {
	limitPeriod = +limitPeriod; // force value to number

	if (limitPeriod > 0) {
		let periodStart = now - (now % limitPeriod);

		// Adjust start time for timezone, DST, and Sunday as first day of week
		if (limitPeriod > 3600) {
			let offsetMins = new Date(now * 1000).getTimezoneOffset();
			periodStart += offsetMins * 60; // add time difference
			if (limitPeriod > 86400) {
				periodStart -= 345600; // subtract four days (Thu back to Sun)
			}

			// Correct any boundary errors
			while (periodStart > now) {
				periodStart -= limitPeriod;
			}
			while (periodStart <= now - limitPeriod) {
				periodStart += limitPeriod;
			}
		}

		return periodStart;
	}

	return 0;
}

// Format a time in seconds to HH:MM:SS format
//
function formatTime(secs) {
	let neg = (secs < 0);
	secs = Math.abs(secs);
	let h = Math.floor(secs / 3600);
	let m = Math.floor(secs / 60) % 60;
	let s = Math.floor(secs) % 60;
	return (neg ? "-" : "") + ((h < 10) ? "0" + h : h)
			+ ":" + ((m < 10) ? "0" + m : m)
			+ ":" + ((s < 10) ? "0" + s : s);
}

// Determine whether all items in array evalate to true
//
function allTrue(array) {
	if (Array.isArray(array)) {
		for (let i = 0; i < array.length; i++) {
			if (!array[i]) return false;
		}
		return true;
	} else {
		return false;
	}
}

// Encode day selection
//
function encodeDays(days) {
	let dayCode = 0;
	for (let i = 0; i < 7; i++) {
		if (days[i]) dayCode |= (1 << i);
	}
	return dayCode;
}

// Decode day selection
//
function decodeDays(dayCode) {
	let days = new Array(7);
	for (let i = 0; i < 7; i++) {
		days[i] = ((dayCode & (1 << i)) != 0);
	}
	return days;
}

// Creates a random access code of a specified length
//
function createAccessCode(len) {
	// Omit O, 0, I, l to avoid ambiguity with some fonts
	const codeChars = "~!@#$%^&*()[]{}?+-=ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789";
	let code = "";
	for (let i = 0; i < len; i++) {
		code += codeChars.charAt(Math.random() * codeChars.length);
	}
	return code;
}
