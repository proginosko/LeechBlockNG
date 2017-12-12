/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_OPTIONS_FILE = "LeechBlockOptions.txt";

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

function getElement(id) { return document.getElementById(id); }

var gAccessConfirmed = false;
var gAccessRequiredInput;

// Save options to local storage (returns true if success)
//
function saveOptions() {
	//log("saveOptions");

	// Check format for text fields in block sets
	for (let set = 1; set <= NUM_SETS; set++) {
		// Get field values
		let times = getElement(`times${set}`).value;
		let limitMins = getElement(`limitMins${set}`).value;
		let delaySecs = getElement(`delaySecs${set}`).value;
		let blockURL = getElement(`blockURL${set}`).value;

		// Check field values
		if (!checkTimePeriodsFormat(times)) {
			$("#tabs").tabs("option", "active", (set - 1));
			$(`#times${set}`).focus();
			$("#alertBadTimes").dialog("open");
			return false;
		}
		if (!checkPosIntFormat(limitMins)) {
			$("#tabs").tabs("option", "active", (set - 1));
			$(`#limitMins${set}`).focus();
			$("#alertBadTimeLimit").dialog("open");
			return false;
		}
		if (!delaySecs || !checkPosIntFormat(delaySecs)) {
			$("#tabs").tabs("option", "active", (set - 1));
			$(`#delaySecs${set}`).focus();
			$("#alertBadSeconds").dialog("open");
			return false;
		}
		if (blockURL != DEFAULT_BLOCK_URL && blockURL != DELAYED_BLOCK_URL
				&& !getParsedURL(blockURL).page) {
			$("#tabs").tabs("option", "active", (set - 1));
			$(`#blockURL${set}`).focus();
			$("#alertBadBlockURL").dialog("open");
			return false;
		}
	}

	// Check format for text fields in general options
	let warnSecs = getElement("warnSecs").value;
	if (!checkPosIntFormat(warnSecs)) {
		$("#tabs").tabs("option", "active", NUM_SETS);
		$("warnSecs").focus();
		$("#alertBadSeconds").dialog("open");
		return false;
	}

	let options = {};

	for (let set = 1; set <= NUM_SETS; set++) {
		// Get component values
		let setName = getElement(`setName${set}`).value;
		let sites = getElement(`sites${set}`).value;
		sites = sites.replace(/\s+/g, " ").replace(/(^ +)|( +$)|(\w+:\/+)/g, "");
		sites = sites.split(" ").sort().join(" "); // sort alphabetically
		let times = getElement(`times${set}`).value;
		let limitMins = getElement(`limitMins${set}`).value;
		let limitPeriod = getElement(`limitPeriod${set}`).value;
		let conjMode = getElement(`conjMode${set}`).selectedIndex == 1;
		let days = [];
		for (let i = 0; i < 7; i++) {
			days.push(getElement(`day${i}${set}`).checked);
		}
		let blockURL = getElement(`blockURL${set}`).value;
		let activeBlock = getElement(`activeBlock${set}`).checked;
		let countFocus = getElement(`countFocus${set}`).checked;
		let delayFirst = getElement(`delayFirst${set}`).checked;
		let delaySecs = getElement(`delaySecs${set}`).value;
		let prevOpts = getElement(`prevOpts${set}`).checked;
		let prevAddons = getElement(`prevAddons${set}`).checked;
		let prevSupport = getElement(`prevSupport${set}`).checked;
		let sitesURL = getElement(`sitesURL${set}`).value;

		// Get regular expressions to match sites
		let regexps = getRegExpSites(sites);

		// Set option values
		options[`setName${set}`] = setName;
		options[`sites${set}`] = sites;
		options[`times${set}`] = cleanTimePeriods(times);
		options[`limitMins${set}`] = limitMins;
		options[`limitPeriod${set}`] = limitPeriod;
		options[`conjMode${set}`] = conjMode;
		options[`days${set}`] = days;
		options[`blockURL${set}`] = blockURL;
		options[`activeBlock${set}`] = activeBlock;
		options[`countFocus${set}`] = countFocus;
		options[`delayFirst${set}`] = delayFirst;
		options[`delaySecs${set}`] = delaySecs;
		options[`prevOpts${set}`] = prevOpts;
		options[`prevAddons${set}`] = prevAddons;
		options[`prevSupport${set}`] = prevSupport;
		options[`sitesURL${set}`] = sitesURL;
		options[`blockRE${set}`] = regexps.block;
		options[`allowRE${set}`] = regexps.allow;
		options[`keywordRE${set}`] = regexps.keyword;

		// Request permission to load sites from URL
		if (sitesURL) {
			let permissions = { origins: ["<all_urls>"] };
			browser.permissions.request(permissions);
		}
	}

	// General options
	options["oa"] = getElement("optionsAccess").value;
	options["password"] = getElement("accessPassword").value;
	options["hpp"] = getElement("hidePassword").checked;
	options["timerVisible"] = getElement("timerVisible").checked;
	options["timerSize"] = getElement("timerSize").value;
	options["timerLocation"] = getElement("timerLocation").value;
	options["warnSecs"] = getElement("warnSecs").value;
	options["contextMenu"] = getElement("contextMenu").checked;

	browser.storage.local.set(options).catch(
		function (error) { warn("Cannot set options: " + error); }
	);

	// Notify extension that options have been updated
	browser.runtime.sendMessage({ type: "options" });

	$("#form").hide({ effect: "fade", complete: retrieveOptions });

	return true;
}

// Save options and close tab
//
function saveOptionsClose() {
	if (saveOptions()) {
		closeOptions();
	}
}

// Close options tab
//
function closeOptions() {
	// Request tab close
	browser.runtime.sendMessage({ type: "close" });
}

// Retrieve options from local storage
//
function retrieveOptions() {
	//log("retrieveOptions");

	browser.storage.local.get().then(onGot, onError);

	function onGot(options) {
		cleanOptions(options);
		cleanTimeData(options);

		// Get current time/date
		let timedate = new Date();

		// Get current time in seconds
		let now = Math.floor(Date.now() / 1000);

		// Check whether a lockdown is currently active
		for (let set = 1; set <= NUM_SETS; set++) {
			let timedata = options[`timedata${set}`];
			let lockdown = (timedata[4] > now);
			getElement(`cancelLockdown${set}`).disabled = !lockdown;
		}

		// Check whether access to options should be prevented
		for (let set = 1; set <= NUM_SETS; set++) {
			if (options[`prevOpts${set}`]) {
				// Get options
				let timedata = options[`timedata${set}`];
				let times = options[`times${set}`];
				let minPeriods = getMinPeriods(times);
				let limitMins = options[`limitMins${set}`];
				let limitPeriod = options[`limitPeriod${set}`];
				let periodStart = getTimePeriodStart(now, limitPeriod);
				let conjMode = options[`conjMode${set}`];
				let days = options[`days${set}`];

				// Check day
				let onSelectedDay = days[timedate.getDay()];

				// Check time periods
				let withinTimePeriods = false;
				if (onSelectedDay && times != "") {
					// Get number of minutes elapsed since midnight
					let mins = timedate.getHours() * 60 + timedate.getMinutes();

					// Check each time period in turn
					for (let mp of minPeriods) {
						if (mins >= mp.start && mins < mp.end) {
							withinTimePeriods = true;
						}
					}
				}

				// Check time limit
				let afterTimeLimit = false;
				if (onSelectedDay && limitMins != "" && limitPeriod != "") {
					// Check time period and time limit
					if (timedata[2] == periodStart && timedata[3] >= (limitMins * 60)) {
						afterTimeLimit = true;
					}
				}

				// Check lockdown condition
				let lockdown = (timedata[4] > now);

				// Disable options if specified block conditions are fulfilled
				if (lockdown
						|| (!conjMode && (withinTimePeriods || afterTimeLimit))
						|| (conjMode && (withinTimePeriods && afterTimeLimit))) {
					// Disable options for this set
					disableSetOptions(set);
				}
			}
		}

		for (let set = 1; set <= NUM_SETS; set++) {
			// Get option values
			let setName = options[`setName${set}`];
			let sites = options[`sites${set}`].replace(/\s+/g, "\n");
			let times = options[`times${set}`];
			let limitMins = options[`limitMins${set}`];
			let limitPeriod = options[`limitPeriod${set}`];
			let conjMode = options[`conjMode${set}`];
			let days = options[`days${set}`];
			let blockURL = options[`blockURL${set}`];
			let activeBlock = options[`activeBlock${set}`];
			let countFocus = options[`countFocus${set}`];
			let delayFirst = options[`delayFirst${set}`];
			let delaySecs = options[`delaySecs${set}`];
			let prevOpts = options[`prevOpts${set}`];
			let prevAddons = options[`prevAddons${set}`];
			let prevSupport = options[`prevSupport${set}`];
			let sitesURL = options[`sitesURL${set}`];
			
			// Apply custom set name to tab (if specified)
			if (setName) {
				getElement(`blockSetName${set}`).innerText = setName;
			} else {
				getElement(`blockSetName${set}`).innerText = `Block Set ${set}`;
			}

			// Set component values
			getElement(`setName${set}`).value = setName;
			getElement(`sites${set}`).value = sites;
			getElement(`times${set}`).value = times;
			getElement(`limitMins${set}`).value = limitMins;
			getElement(`limitPeriod${set}`).value = limitPeriod;
			getElement(`conjMode${set}`).selectedIndex = conjMode ? 1 : 0;
			for (let i = 0; i < 7; i++) {
				getElement(`day${i}${set}`).checked = days[i];
			}
			getElement(`blockURL${set}`).value = blockURL;
			getElement(`activeBlock${set}`).checked = activeBlock;
			getElement(`countFocus${set}`).checked = countFocus;
			getElement(`delayFirst${set}`).checked = delayFirst;
			getElement(`delaySecs${set}`).value = delaySecs;
			getElement(`prevOpts${set}`).checked = prevOpts;
			getElement(`prevAddons${set}`).checked = prevAddons;
			getElement(`prevSupport${set}`).checked = prevSupport;
			getElement(`sitesURL${set}`).value = sitesURL;
		}

		// General options
		getElement("optionsAccess").value = options["oa"];
		getElement("accessPassword").value = options["password"];
		getElement("hidePassword").checked = options["hpp"];
		getElement("timerVisible").checked = options["timerVisible"];
		getElement("timerSize").value = options["timerSize"];
		getElement("timerLocation").value = options["timerLocation"];
		getElement("warnSecs").value = options["warnSecs"];
		getElement("contextMenu").checked = options["contextMenu"];

		confirmAccess(options);
	}

	function onError(error) {
		warn("Cannot get options: " + error);
		$("#alertRetrieveError").dialog("open");
	}
}

// Confirm access to options
//
function confirmAccess(options) {
	if (gAccessConfirmed) {
		// Access already confirmed
		$("#form").show({ effect: "fade" });
		return;
	}

	let oa = options["oa"];
	let password = options["password"];
	let hpp = options["hpp"];

	if (oa == 1 && password) {
		gAccessRequiredInput = password;
		if (hpp) {
			$("#promptPasswordInput").attr("type", "password");
		} else {
			$("#promptPasswordInput").attr("type", "text");
		}
		$("#promptPasswordInput").val("");
		$("#promptPassword").dialog("open");
		$("#promptPasswordInput").focus();
	} else if (oa > 1) {
		let code = createAccessCode(32);
		let codeText = code;
		gAccessRequiredInput = code;
		if (oa > 2) {
			code = createAccessCode(32);
			codeText += code;
			gAccessRequiredInput += code;
		}
		if (oa > 3) {
			code = createAccessCode(32);
			codeText += "<br>" + code;
			gAccessRequiredInput += code;
			code = createAccessCode(32);
			codeText += code;
			gAccessRequiredInput += code;
		}
		$("#promptAccessCodeText").html(codeText);
		$("#promptAccessCodeInput").val("");
		$("#promptAccessCode").dialog("open");
		$("#promptAccessCodeInput").focus();
	} else {
		gAccessConfirmed = true;
		$("#form").show({ effect: "fade" });
	}
}

// Export options
//
function exportOptions() {
	let options = {};

	for (let set = 1; set <= NUM_SETS; set++) {
		// Get component values
		let setName = getElement(`setName${set}`).value;
		let sites = getElement(`sites${set}`).value;
		sites = sites.replace(/\s+/g, " ").replace(/(^ +)|( +$)|(\w+:\/+)/g, "");
		let times = getElement(`times${set}`).value;
		let limitMins = getElement(`limitMins${set}`).value;
		let limitPeriod = getElement(`limitPeriod${set}`).value;
		let conjMode = getElement(`conjMode${set}`).selectedIndex == 1;
		let days = [];
		for (let i = 0; i < 7; i++) {
			days.push(getElement(`day${i}${set}`).checked);
		}
		let blockURL = getElement(`blockURL${set}`).value;
		let activeBlock = getElement(`activeBlock${set}`).checked;
		let countFocus = getElement(`countFocus${set}`).checked;
		let delayFirst = getElement(`delayFirst${set}`).checked;
		let delaySecs = getElement(`delaySecs${set}`).value;
		let prevOpts = getElement(`prevOpts${set}`).checked;
		let prevAddons = getElement(`prevAddons${set}`).checked;
		let prevSupport = getElement(`prevSupport${set}`).checked;
		let sitesURL = getElement(`sitesURL${set}`).value;

		// Set option values
		options[`setName${set}`] = setName;
		options[`sites${set}`] = sites;
		options[`times${set}`] = cleanTimePeriods(times);
		options[`limitMins${set}`] = limitMins;
		options[`limitPeriod${set}`] = limitPeriod;
		options[`conjMode${set}`] = conjMode;
		options[`days${set}`] = encodeDays(days);
		options[`blockURL${set}`] = blockURL;
		options[`activeBlock${set}`] = activeBlock;
		options[`countFocus${set}`] = countFocus;
		options[`delayFirst${set}`] = delayFirst;
		options[`delaySecs${set}`] = delaySecs;
		options[`prevOpts${set}`] = prevOpts;
		options[`prevAddons${set}`] = prevAddons;
		options[`prevSupport${set}`] = prevSupport;
		options[`sitesURL${set}`] = sitesURL;
	}

	// General options
	options["oa"] = getElement("optionsAccess").value;
	options["password"] = getElement("accessPassword").value;
	options["hpp"] = getElement("hidePassword").checked;
	options["timerVisible"] = getElement("timerVisible").checked;
	options["timerSize"] = getElement("timerSize").value;
	options["timerLocation"] = getElement("timerLocation").value;
	options["warnSecs"] = getElement("warnSecs").value;
	options["contextMenu"] = getElement("contextMenu").checked;

	// Convert options to text lines
	let lines = [];
	for (let option in options) {
		lines.push(option + "=" + options[option] + "\n");
	}

	// Create blob and download it
	let blob = new Blob(lines, { type: "text/plain", endings: "native" });
	var url = URL.createObjectURL(blob);
	browser.downloads.download({ url: url, filename: DEFAULT_OPTIONS_FILE, saveAs: true });
}

// Import options
//
function importOptions() {
	let file = getElement("importFile").files[0];
	if (!file) {
		$("#alertNoImportFile").dialog("open");
		return;
	}

	// Read and process file
	let reader = new FileReader();
	reader.onload = processImportFile;
	reader.readAsText(file);
	
	function processImportFile(event) {
		let text = event.target.result;
		if (!text) {
			warn("Cannot import options from file.");
			return;
		}

		function isTrue(str) { return /^true$/i.test(str); }

		// Extract options from text
		let regexp = /^(\w+)=(.*)$/;
		let lines = text.split(/[\n\r]+/);
		let options = {};
		for (let line of lines) {
			let results = regexp.exec(line);
			if (results) {
				options[results[1]] = results[2];
			}
		}

		for (let set = 1; set <= NUM_SETS; set++) {
			// Get option values
			let setName = options[`setName${set}`];
			let sites = options[`sites${set}`];
			let times = options[`times${set}`];
			let limitMins = options[`limitMins${set}`];
			let limitPeriod = options[`limitPeriod${set}`];
			let conjMode = options[`conjMode${set}`];
			let days = options[`days${set}`];
			let blockURL = options[`blockURL${set}`];
			let activeBlock = options[`activeBlock${set}`];
			let countFocus = options[`countFocus${set}`];
			let delayFirst = options[`delayFirst${set}`];
			let delaySecs = options[`delaySecs${set}`];
			let prevOpts = options[`prevOpts${set}`];
			let prevAddons = options[`prevAddons${set}`];
			let prevSupport = options[`prevSupport${set}`];
			let sitesURL = options[`sitesURL${set}`];

			// Set component values
			if (setName != undefined) {
				let element = getElement(`setName${set}`);
				if (!element.disabled) {
					element.value = setName;
					if (setName) {
						getElement(`blockSetName${set}`).innerText = setName;
					} else {
						getElement(`blockSetName${set}`).innerText = `Block Set ${set}`;
					}
				}
			}
			if (sites != undefined) {
				let element = getElement(`sites${set}`);
				if (!element.disabled) {
					element.value = sites.replace(/\s+/g, "\n");
				}
			}
			if (times != undefined) {
				let element = getElement(`times${set}`);
				if (!element.disabled) {
					element.value = times;
				}
			}
			if (limitMins != undefined) {
				let element = getElement(`limitMins${set}`);
				if (!element.disabled) {
					element.value = limitMins;
				}
			}
			if (limitPeriod != undefined) {
				let element = getElement(`limitPeriod${set}`);
				if (!element.disabled) {
					element.value = limitPeriod;
				}
			}
			if (conjMode != undefined) {
				let element = getElement(`conjMode${set}`);
				if (!element.disabled) {
					element.selectedIndex = isTrue(conjMode) ? 1 : 0;
				}
			}
			if (days != undefined) {
				days = decodeDays(days);
				for (let i = 0; i < 7; i++) {
					let element = getElement(`day${i}${set}`);
					if (!element.disabled) {
						element.checked = days[i];
					}
				}
			}
			if (blockURL != undefined) {
				let element = getElement(`blockURL${set}`);
				if (!element.disabled) {
					element.value = blockURL;
				}
			}
			if (activeBlock != undefined) {
				let element = getElement(`activeBlock${set}`);
				if (!element.disabled) {
					element.checked = isTrue(activeBlock);
				}
			}
			if (countFocus != undefined) {
				let element = getElement(`countFocus${set}`);
				if (!element.disabled) {
					element.checked = isTrue(countFocus);
				}
			}
			if (delayFirst != undefined) {
				let element = getElement(`delayFirst${set}`);
				if (!element.disabled) {
					element.checked = isTrue(delayFirst);
				}
			}
			if (delaySecs != undefined) {
				let element = getElement(`delaySecs${set}`);
				if (!element.disabled) {
					element.value = delaySecs;
				}
			}
			if (prevOpts != undefined) {
				let element = getElement(`prevOpts${set}`);
				if (!element.disabled) {
					element.checked = isTrue(prevOpts);
				}
			}
			if (prevAddons != undefined) {
				let element = getElement(`prevAddons${set}`);
				if (!element.disabled) {
					element.checked = isTrue(prevAddons);
				}
			}
			if (prevSupport != undefined) {
				let element = getElement(`prevSupport${set}`);
				if (!element.disabled) {
					element.checked = isTrue(prevSupport);
				}
			}
			if (sitesURL != undefined) {
				let element = getElement(`sitesURL${set}`);
				if (!element.disabled) {
					element.value = sitesURL;
				}
			}
		}

		// General options
		let oa = options["oa"];
		let password = options["password"];
		let hpp = options["hpp"];
		let timerVisible = options["timerVisible"];
		let timerSize = options["timerSize"];
		let timerLocation = options["timerLocation"];
		let warnSecs = options["warnSecs"];
		let contextMenu = options["contextMenu"];
		if (oa != undefined) {
			getElement("optionsAccess").value = oa;
		}
		if (password != undefined) {
			getElement("accessPassword").value = password;
		}
		if (hpp != undefined) {
			getElement("hidePassword").checked = hpp;
		}
		if (timerVisible != undefined) {
			getElement("timerVisible").checked = timerVisible;
		}
		if (timerSize != undefined) {
			getElement("timerSize").value = timerSize;
		}
		if (timerLocation != undefined) {
			getElement("timerLocation").value = timerLocation;
		}
		if (warnSecs != undefined) {
			getElement("warnSecs").value = warnSecs;
		}
		if (contextMenu != undefined) {
			getElement("contextMenu").checked = contextMenu;
		}
	}
}

// Disable options for block set
//
function disableSetOptions(set) {
	let items = [
		"setName", "sites",
		"times", "allDay", "limitMins", "limitPeriod", "conjMode",
		"day0", "day1", "day2", "day3", "day4", "day5", "day6",
		"blockURL", "defaultPage", "delayingPage", "blankPage", "homePage",
		"activeBlock", "countFocus", "delayFirst", "delaySecs",
		"prevOpts", "prevAddons", "prevSupport", "sitesURL", "cancelLockdown"
	];
	for (let item of items) {
		let element = getElement(`${item}${set}`);
		if (element) {
			element.disabled = true;
		}
	}
}

// Initialize access control prompt
//
function initAccessControlPrompt(prompt) {
	// Create functions for buttons
	let dialogButtons = {
		OK: function () {
			let input = $(`#${prompt}Input`);
			if (input.val() == gAccessRequiredInput) {
				gAccessConfirmed = true;
				$("#form").show({ effect: "fade" });
				$(`#${prompt}`).dialog("close");
			} else {
				input.val("");
				input.effect({ effect: "highlight", color: "#ff0000" });
				input.focus();
			}
		},
		Cancel: function () {
			$(`#${prompt}`).dialog("close");
		}
	};

	// Initialize prompt dialog
	$(`#${prompt}`).dialog({
		autoOpen: false,
		modal: true,
		width: 600,
		buttons: dialogButtons,
		close: function (event, ui) { if (!gAccessConfirmed) closeOptions(); }
	});

	// Connect ENTER key to OK button
	$(`#${prompt}Input`).keydown(
		function (event) {
			if (event.which == 13) {
				dialogButtons.OK();
			}
		}
	);
}

/*** STARTUP CODE BEGINS HERE ***/

// Use HTML for first block set to create other block sets
let tabHTML = $("#tabBlockSet1").html();
let setHTML = $("#blockSet1").html();
for (let set = 2; set <= NUM_SETS; set++) {
	let nextTabHTML = tabHTML
			.replace(/Block Set 1/g, `Block Set ${set}`)
			.replace(/(id|href)="(#?\w+)1"/g, `$1="$2${set}"`);
	let nextSetHTML = setHTML
			.replace(/(id|for)="(\w+)1"/g, `$1="$2${set}"`);
	$("#tabGeneral").before(`<li id="tabBlockSet${set}">${nextTabHTML}</li>`);
	$("#generalOptions").before(`<div id="blockSet${set}">${nextSetHTML}</div>`);
}

// Set up JQuery UI widgets
$("#tabs").tabs();
for (let set = 1; set <= NUM_SETS; set++) {
	$(`#allDay${set}`).click(function (e) { $(`#times${set}`).val(ALL_DAY_TIMES); });
	$(`#defaultPage${set}`).click(function (e) { $(`#blockURL${set}`).val(DEFAULT_BLOCK_URL); });
	$(`#delayingPage${set}`).click(function (e) { $(`#blockURL${set}`).val(DELAYED_BLOCK_URL); });
	$(`#blankPage${set}`).click(function (e) { $(`#blockURL${set}`).val("about:blank"); });
	$(`#homePage${set}`).click(function (e) { $(`#blockURL${set}`).val("about:home"); });
	$(`#showAdvOpts${set}`).click(function (e) {
		$(`#showAdvOpts${set}`).css("display", "none");
		$(`#advOpts${set}`).css("display", "block");
	});
	$(`#cancelLockdown${set}`).click(function (e) {
		browser.runtime.sendMessage({ type: "lockdown", set: set });
		this.disabled = true;
		$("#alertLockdownCancel").dialog("open");
	});
	$(`#advOpts${set}`).css("display", "none");
}
$("#exportOptions").click(exportOptions);
$("#importOptions").click(importOptions);
$("#saveOptions").button();
$("#saveOptions").click(saveOptions);
$("#saveOptionsClose").button();
$("#saveOptionsClose").click(saveOptionsClose);

// Initialize alert dialogs
$("div[id^='alert']").dialog({
	autoOpen: false,
	modal: true,
	width: 600,
	buttons: {
		OK: function () { $(this).dialog("close"); }
	}
});

// Initialize access control prompts
initAccessControlPrompt("promptPassword");
initAccessControlPrompt("promptAccessCode");

document.addEventListener("DOMContentLoaded", retrieveOptions);
