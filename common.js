/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MAX_SETS = 30;
const ALL_DAY_TIMES = "0000-2400";
const DEFAULT_BLOCK_URL = "blocked.html?$S&$U";
const DELAYED_BLOCK_URL = "delayed.html?$S&$U";
const DEFAULT_ICON = { 16: "icons/leechblock16.png", 32: "icons/leechblock32.png" };
const OVERRIDE_ICON = { 16: "icons/leechblock16o.png", 32: "icons/leechblock32o.png" };

const PARSE_URL = /^((([\w-]+):\/*(\w+(?::\w+)?@)?([\w-\.]+)(?::(\d*))?)([^\?#]*))(\?[^#]*)?(#.*)?$/;

const LEECHBLOCK_URL = "https://www.proginosko.com/leechblock/";

const DELAY_ALLOW_DURATIONS = [
	{ minutes: 5,  text: "5 minutes" },
	{ minutes: 10, text: "10 minutes" },
	{ minutes: 15, text: "15 minutes" },
	{ minutes: 30, text: "30 minutes" },
	{ minutes: 60, text: "1 hour (60 minutes)" },
	{ minutes: 90, text: "1.5 hours (90 minutes)" },
	{ minutes: 120, text: "2 hours (120 minutes)" },
	{ minutes: 180, text: "3 hours (180 minutes)" }
];

const PER_SET_OPTIONS = {
	// def: default value, id: form element identifier (see options.html)
	setName: { type: "string", def: "", id: "setName" },
	sites: { type: "string", def: "", id: "sites" },
	times: { type: "string", def: "0900-1700", id: "times" },
	limitMins: { type: "string", def: "", id: "limitMins" },
	limitPeriod: { type: "string", def: "", id: "limitPeriod" },
	limitOffset: { type: "string", def: "", id: "limitOffset" },
	conjMode: { type: "boolean", def: false, id: "conjMode" },
	days: { type: "array", def: [false, true, true, true, true, true, false], id: "day" },
	blockURL: { type: "string", def: DEFAULT_BLOCK_URL, id: "blockURL" },
	applyFilter: { type: "boolean", def: false, id: "applyFilter" },
	closeTab: { type: "boolean", def: false, id: "closeTab" },
	filterName: { type: "string", def: "grayscale", id: "filterName" },
	activeBlock: { type: "boolean", def: false, id: "activeBlock" },
	countFocus: { type: "boolean", def: true, id: "countFocus" },
	delayMethod: { type: "string", def: "consecutive", id: "delayMethod" },
	delayAllowMaxDuration: { type: "string", def: "60", id: "delayAllowMaxDuration" },
	delaySecs: { type: "string", def: "60", id: "delaySecs" },
	reloadSecs: { type: "string", def: "", id: "reloadSecs" },
	allowOverride: { type: "boolean", def: false, id: "allowOverride" },
	prevOpts: { type: "boolean", def: false, id: "prevOpts" },
	prevGenOpts: { type: "boolean", def: false, id: "prevGenOpts" },
	prevAddons: { type: "boolean", def: false, id: "prevAddons" },
	prevSupport: { type: "boolean", def: false, id: "prevSupport" },
	showTimer: { type: "boolean", def: true, id: "showTimer" },
	allowKeywords: { type: "boolean", def: false, id: "allowKeywords" },
	sitesURL: { type: "string", def: "", id: "sitesURL" },
	regexpBlock: { type: "string", def: "", id: "regexpBlock" },
	regexpAllow: { type: "string", def: "", id: "regexpAllow" },
	ignoreHash: { type: "boolean", def: true, id: "ignoreHash" },
};

const GENERAL_OPTIONS = {
	// def: default value, id: form element identifier (see options.html)
	numSets: { type: "string", def: "6", id: "numSets" }, // default: 6 block sets
	sync: { type: "boolean", def: false, id: "syncStorage" }, // default: use local storage
	theme: { type: "string", def: "", id: "theme" }, // default: light theme
	oa: { type: "string", def: "0", id: "optionsAccess" }, // default: no password or code
	password: { type: "string", def: "", id: "accessPassword" }, // default: blank
	hpp: { type: "boolean", def: true, id: "hidePassword" }, // default: hidden
	timerVisible: { type: "boolean", def: true, id: "timerVisible" }, // default: visible
	timerSize: { type: "string", def: "1", id: "timerSize" }, // default: medium
	timerLocation: { type: "string", def: "0", id: "timerLocation" }, // default: top left
	timerBadge: { type: "boolean", def: true, id: "timerBadge" }, // default: enabled
	orm: { type: "string", def: "", id: "overrideMins" }, // default: no override
	ora: { type: "string", def: "0", id: "overrideAccess" }, // default: no password or code
	orc: { type: "boolean", def: true, id: "overrideConfirm" }, // default: enabled
	warnSecs: { type: "string", def: "", id: "warnSecs" }, // default: no warning
	warnImmediate: { type: "boolean", def: true, id: "warnImmediate" }, // default: warn only for immediate block
	contextMenu: { type: "boolean", def: true, id: "contextMenu" }, // default: enabled
	toolsMenu: { type: "boolean", def: true, id: "toolsMenu" }, // default: enabled
	matchSubdomains: { type: "boolean", def: false, id: "matchSubdomains" }, // default: disabled
	saveSecs: { type: "string", def: "10", id: "saveSecs" }, // default: every 10 seconds
	clockOffset: { type: "string", def: "", id: "clockOffset" }, // default: no offset
	allFocused: { type: "boolean", def: false, id: "allFocused" }, // default: disabled
	processActiveTabs: { type: "boolean", def: false, id: "processActiveTabs" }, // default: disabled
	accessCodeImage: { type: "boolean", def: false, id: "accessCodeImage" }, // default: disabled
	autoExportSync: { type: "boolean", def: true, id: "autoExportSync" }, // default: enabled
	lockdownHours: { type: "string", def: "", id: null }, // default: blank
	lockdownMins: { type: "string", def: "", id: null }, // default: blank
};

function listObjectProperties(obj, name) {
	let list = "";
	for (let prop of Object.keys(obj).sort()) {
		list += `${name}.${prop}=${obj[prop]}\n`;
	}
	return list;
}

// Clean options (check types and set default values where needed)
//
function cleanOptions(options) {
	// General options
	for (let name in GENERAL_OPTIONS) {
		let type = GENERAL_OPTIONS[name].type;
		let def = GENERAL_OPTIONS[name].def;
		if (typeof options[`${name}`] != type) {
			options[`${name}`] = def;
		}
	}

	// Clean number of block sets
	let numSets = +options["numSets"];
	numSets = Math.max(1, Math.min(MAX_SETS, Math.floor(numSets)));
	options["numSets"] = numSets.toString();

	// Per-set options
	for (let name in PER_SET_OPTIONS) {
		let type = PER_SET_OPTIONS[name].type;
		let def = PER_SET_OPTIONS[name].def;
		for (let set = 1; set <= numSets; set++) {
			if (type == "array") {
				if (!Array.isArray(options[`${name}${set}`])) {
					options[`${name}${set}`] = def.slice();
				}
			} else if (typeof options[`${name}${set}`] != type) {
				options[`${name}${set}`] = def;
			}
		}
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
	let numSets = +options["numSets"];
	let clockOffset = options["clockOffset"];
	let now = Math.floor(Date.now() / 1000) + (clockOffset * 60);
	for (let set = 1; set <= numSets; set++) {
		let timedata = options[`timedata${set}`];
		if (!Array.isArray(timedata) || timedata.length < 5) {
			timedata = [now, 0, 0, 0, 0];
		}
		options[`timedata${set}`] = timedata;
	}
}

// Return parsed URL (page address, arguments, and hash)
//
function getParsedURL(url) {
	let results = PARSE_URL.exec(url);
	if (results) {
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
			page: query ? (page + query) : page,
			origin: origin,
			protocol: protocol,
			host: host,
			pathNoArgs: path,
			path: query ? (path + query) : path,
			query: query,
			args: query ? query.substring(1).split(/[;&]/) : null,
			hash: fragment ? fragment.substring(1) : null 
		};
	} else {
		warn("Cannot parse URL: " + url);
		return {
			pageNoArgs: null,
			page: null,
			origin: null,
			protocol: null,
			host: null,
			pathNoArgs: null,
			path: null,
			query: null,
			args: null,
			hash: null
		};
	}
}

// Clean list of sites
//
function cleanSites(sites) {
	sites = sites.replace(/\s+/g, " ").replace(/(^ +)|( +$)|(\w+:\/+)/g, "");
	sites = sites.split(" ").sort().join(" "); // sort alphabetically
	return sites;
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

// Check positive/negative integer format
//
function checkPosNegIntFormat(value) {
	return (value == "") || /^-?[1-9][0-9]*$/.test(value);
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
function getTimePeriodStart(now, limitPeriod, limitOffset) {
	limitPeriod = +limitPeriod; // force value to number
	limitOffset = +limitOffset; // force value to number

	if (limitPeriod > 0) {
		let periodStart = now - (now % limitPeriod);

		// Adjust start time for timezone, DST, and Sunday as first day of week
		if (limitPeriod > 3600) {
			periodStart += limitOffset * 3600; // add user-specified offset (hours)
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

// Add new options for each duration in DELAY_ALLOW_DURATIONS into a select element up to limitMins
//
function addDelayAllowDurationsToSelectElement(selectElem, limitMins) {
	for (let duration of DELAY_ALLOW_DURATIONS) {
		if (limitMins && duration.minutes > limitMins) break;
		let option = document.createElement("option");
		option.value = "" + duration.minutes;
		option.text = duration.text;
		selectElem.add(option);
	}
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

// Create a random access code of a specified length
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

// Set theme in current document
//
function setTheme(theme) {
	let link = document.getElementById("themeLink");
	if (link) {
		link.href = theme ? `themes/${theme}.css` : "";
	}
}
