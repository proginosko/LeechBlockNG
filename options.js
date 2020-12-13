/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DEFAULT_OPTIONS_FILE = "LeechBlockOptions.txt";

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

function getElement(id) { return document.getElementById(id); }

function isTrue(str) { return /^true$/i.test(str); }

var gIsAndroid = false;
var gAccessConfirmed = false;
var gAccessRequiredInput;
var gFormHTML;
var gNumSets, gNumSetsMin;
var gTabIndex = 0;

// Initialize form (with specified number of block sets)
//
function initForm(numSets) {
	//log("initForm: " + numSets);

	// Reset form to original HTML
	$("#form").html(gFormHTML);

	gNumSets = +numSets;
	gNumSetsMin = 1;

	// Set maximum number of block sets
	$("#maxSets").text(MAX_SETS);

	// Set version text
	$("#version").text(browser.runtime.getManifest().version);

	// Use HTML for first block set to create other block sets
	let tabHTML = $("#tabBlockSet1").html();
	let setHTML = $("#blockSet1").html();
	for (let set = 2; set <= gNumSets; set++) {
		let nextTabHTML = tabHTML
				.replace(/(Block Set) 1/g, `$1 ${set}`)
				.replace(/(id|href)="(#?\w+)1"/g, `$1="$2${set}"`);
		let nextSetHTML = setHTML
				.replace(/(id|for)="(\w+)1"/g, `$1="$2${set}"`);
		$("#tabGeneral").before(`<li id="tabBlockSet${set}">${nextTabHTML}</li>`);
		$("#paneGeneral").before(`<div id="blockSet${set}">${nextSetHTML}</div>`);
	}

	// Set up JQuery UI widgets
	$("#tabs").tabs({ activate: onActivate });
	for (let set = 1; set <= gNumSets; set++) {
		$(`#allDay${set}`).click(function (e) { $(`#times${set}`).val(ALL_DAY_TIMES); });
		$(`#defaultPage${set}`).click(function (e) { $(`#blockURL${set}`).val(DEFAULT_BLOCK_URL); });
		$(`#delayingPage${set}`).click(function (e) { $(`#blockURL${set}`).val(DELAYED_BLOCK_URL); });
		$(`#blankPage${set}`).click(function (e) { $(`#blockURL${set}`).val("about:blank"); });
		addDelayAllowDurationsToSelectElement($(`#delayAllowMaxDuration${set}`)[0]);
		$(`#resetOpts${set}`).click(function (e) {
			resetSetOptions(set);
			$("#alertResetOptions").dialog("open");
		});
		$(`#showAdvOpts${set}`).click(function (e) {
			$(`#showAdvOpts${set}`).css("display", "none");
			$(`#advOpts${set}`).css("display", "block");
		});
		$(`#clearRegExpBlock${set}`).click(function (e) { $(`#regexpBlock${set}`).val(""); });
		$(`#genRegExpBlock${set}`).click(function (e) {
			let sites = $(`#sites${set}`).val();
			let matchSubdomains = getElement("matchSubdomains").checked;
			$(`#regexpBlock${set}`).val(getRegExpSites(sites, matchSubdomains).block);
		});
		$(`#clearRegExpAllow${set}`).click(function (e) { $(`#regexpAllow${set}`).val(""); });
		$(`#genRegExpAllow${set}`).click(function (e) {
			let sites = $(`#sites${set}`).val();
			let matchSubdomains = getElement("matchSubdomains").checked;
			$(`#regexpAllow${set}`).val(getRegExpSites(sites, matchSubdomains).allow);
		});
		$(`#cancelLockdown${set}`).click(function (e) {
			browser.runtime.sendMessage({ type: "lockdown", set: set });
			this.disabled = true;
			$("#alertLockdownCancel").dialog("open");
		});
		$(`#advOpts${set}`).css("display", "none");
	}
	$("#theme").change(function (e) { setTheme($("#theme").val()); });
	$("#clockOffset").click(showClockOffsetTime);
	$("#clockOffset").keyup(showClockOffsetTime);
	$("#clockOffsetTime").click(showClockOffsetTime);
	$("#exportOptions").click(exportOptions);
	$("#importOptions").click(importOptions);
	$("#exportOptionsSync").click(exportOptionsSync);
	$("#importOptionsSync").click(importOptionsSync);
	$("#saveOptions").button();
	$("#saveOptions").click({ closeOptions: false }, saveOptions);
	$("#saveOptionsClose").button();
	$("#saveOptionsClose").click({ closeOptions: true }, saveOptions);

	// Set active tab
	if (gTabIndex < 0) {
		// -ve index = other tab (General, About)
		let index = Math.max(0, gTabIndex + gNumSets + 2);
		$("#tabs").tabs("option", "active", index);
	} else {
		// +ve index = block set tab
		let index = Math.min(gTabIndex, gNumSets - 1);
		$("#tabs").tabs("option", "active", index);
	}

	function onActivate(event, ui) {
		let index = ui.newTab.index();
		gTabIndex = (index < gNumSets) ? index : (index - gNumSets - 2);
	}
}

// Save options to local storage (returns true if success)
//
function saveOptions(event) {
	//log("saveOptions");

	// Check format for text fields in block sets
	for (let set = 1; set <= gNumSets; set++) {
		// Get field values
		let times = $(`#times${set}`).val();
		let limitMins = $(`#limitMins${set}`).val();
		let limitOffset = $(`#limitOffset${set}`).val();
		let delaySecs = $(`#delaySecs${set}`).val();
		let reloadSecs = $(`#reloadSecs${set}`).val();
		let blockURL = $(`#blockURL${set}`).val();

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
		if (!checkPosNegIntFormat(limitOffset)) {
			$("#tabs").tabs("option", "active", (set - 1));
			$(`#limitOffset${set}`).focus();
			$("#alertBadTimeLimitOffset").dialog("open");
			return false;
		}
		if (!delaySecs || !checkPosIntFormat(delaySecs)) {
			$("#tabs").tabs("option", "active", (set - 1));
			$(`#delaySecs${set}`).focus();
			$("#alertBadSeconds").dialog("open");
			return false;
		}
		if (!checkPosIntFormat(reloadSecs)) {
			$("#tabs").tabs("option", "active", (set - 1));
			$(`#reloadSecs${set}`).focus();
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
	let numSets = $("#numSets").val();
	if (!numSets || !checkPosIntFormat(numSets)) {
		$("#tabs").tabs("option", "active", gNumSets);
		$("#numSets").focus();
		$("#alertBadNumSets").dialog("open");
		return false;
	}
	let overrideMins = $("#overrideMins").val();
	if (!checkPosIntFormat(overrideMins)) {
		$("#tabs").tabs("option", "active", gNumSets);
		$("#overrideMins").focus();
		$("#alertBadMinutes").dialog("open");
		return false;
	}
	let warnSecs = $("#warnSecs").val();
	if (!checkPosIntFormat(warnSecs)) {
		$("#tabs").tabs("option", "active", gNumSets);
		$("#warnSecs").focus();
		$("#alertBadSeconds").dialog("open");
		return false;
	}
	let saveSecs = $("#saveSecs").val();
	if (!saveSecs || !checkPosIntFormat(saveSecs)) {
		$("#tabs").tabs("option", "active", gNumSets);
		$("#saveSecs").focus();
		$("#alertBadSeconds").dialog("open");
		return false;
	}
	let clockOffset = $("#clockOffset").val();
	if (!checkPosNegIntFormat(clockOffset)) {
		$("#tabs").tabs("option", "active", gNumSets);
		$("#clockOffset").focus();
		$("#alertBadClockOffset").dialog("open");
		return false;
	}

	// Prevent removal of block sets with disabled options
	if (numSets < gNumSetsMin) {
		$("#numSets").val(gNumSetsMin);
	}

	let options = {};

	// General options
	for (let name in GENERAL_OPTIONS) {
		let type = GENERAL_OPTIONS[name].type;
		let id = GENERAL_OPTIONS[name].id;
		if (id) {
			if (type == "boolean") {
				options[name] = getElement(id).checked;
			} else if (type == "string") {
				options[name] = getElement(id).value;
			}
		}
	}

	// Per-set options
	for (let set = 1; set <= gNumSets; set++) {
		for (let name in PER_SET_OPTIONS) {
			let type = PER_SET_OPTIONS[name].type;
			let id = PER_SET_OPTIONS[name].id;

			// Set option value
			if (name == "sites") {
				let sites = cleanSites(getElement(`${id}${set}`).value);
				options[`${name}${set}`] = sites;

				// Get regular expressions to match sites
				let regexps = getRegExpSites(sites, options["matchSubdomains"]);
				options[`blockRE${set}`] = regexps.block;
				options[`allowRE${set}`] = regexps.allow;
				options[`keywordRE${set}`] = regexps.keyword;
			} else if (name == "times") {
				let times = cleanTimePeriods(getElement(`${id}${set}`).value);
				options[`${name}${set}`] = times;
			} else if (name == "conjMode") {
				options[`${name}${set}`] = getElement(`${id}${set}`).selectedIndex == 1;
			} else if (type == "boolean") {
				options[`${name}${set}`] = getElement(`${id}${set}`).checked;
			} else if (type == "string") {
				options[`${name}${set}`] = getElement(`${id}${set}`).value;
			} else if (type == "array") {
				let val = PER_SET_OPTIONS[name].def.slice();
				for (let i = 0; i < val.length; i++) {
					val[i] = getElement(`${id}${i}${set}`).checked;
				}
				options[`${name}${set}`] = val;
			}
		}

		// Request permission to load sites from URL
		if (options[`sitesURL${set}`]) {
			let permissions = { origins: ["<all_urls>"] };
			browser.permissions.request(permissions);
		}
	}

	let complete = event.data.closeOptions ? closeOptions : retrieveOptions;

	if (options["sync"]) {
		// Set sync option in local storage and all options in sync storage
		browser.storage.local.set({ sync: true });
		browser.storage.sync.set(options).then(
			function () {
				browser.runtime.sendMessage({ type: "options" });
				$("#form").hide({ effect: "fade", complete: complete });
			},
			function (error) { warn("Cannot set options: " + error); }
		);
	} else {
		// Export options to sync storage if selected
		if (options["autoExportSync"] && !gIsAndroid) {
			exportOptionsSync(); // no event passed, so dialogs suppressed
		}

		// Set all options in local storage
		browser.storage.local.set(options).then(
			function () {
				browser.runtime.sendMessage({ type: "options" });
				$("#form").hide({ effect: "fade", complete: complete });
			},
			function (error) { warn("Cannot set options: " + error); }
		);
	}

	return true;
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

	browser.storage.local.get("sync").then(onGotSync, onError);

	function onGotSync(options) {
		if(options["sync"]) {
			// Get all options from sync storage
			browser.storage.sync.get().then(onGot, onError);
		} else {
			// Get all options from local storage
			browser.storage.local.get().then(onGot, onError);
		}
	}

	function onGot(options) {
		cleanOptions(options);
		cleanTimeData(options);

		// Initialize form
		initForm(options["numSets"]);

		setTheme(options["theme"]);

		// Get current time in seconds
		let clockOffset = options["clockOffset"];
		let now = Math.floor(Date.now() / 1000) + (clockOffset * 60);

		// Get current time/date
		let timedate = new Date(now * 1000);

		// Check whether a lockdown is currently active
		for (let set = 1; set <= gNumSets; set++) {
			let timedata = options[`timedata${set}`];
			let lockdown = (timedata[4] > now);
			getElement(`cancelLockdown${set}`).disabled = !lockdown;
		}

		// Check whether access to options should be prevented
		for (let set = 1; set <= gNumSets; set++) {
			// Get options
			let timedata = options[`timedata${set}`];
			let times = options[`times${set}`];
			let minPeriods = getMinPeriods(times);
			let limitMins = options[`limitMins${set}`];
			let limitPeriod = options[`limitPeriod${set}`];
			let limitOffset = options[`limitOffset${set}`];
			let periodStart = getTimePeriodStart(now, limitPeriod, limitOffset);
			let conjMode = options[`conjMode${set}`];
			let days = options[`days${set}`];

			// Check day
			let onSelectedDay = days[timedate.getDay()];

			// Check time periods
			let withinTimePeriods = false;
			if (onSelectedDay && times) {
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
			if (onSelectedDay && limitMins && limitPeriod) {
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
				if (options[`prevOpts${set}`]) {
					gNumSetsMin = set;
					// Disable options for this set
					disableSetOptions(set);
					// Disable import options
					disableImportOptions();
				}
				if (options[`prevGenOpts${set}`]) {
					// Disable general options
					disableGeneralOptions();
				}
			}
		}

		// Per-set options
		for (let set = 1; set <= gNumSets; set++) {
			for (let name in PER_SET_OPTIONS) {
				let type = PER_SET_OPTIONS[name].type;
				let id = PER_SET_OPTIONS[name].id;
				let val = options[`${name}${set}`];

				// Set component value
				if (name == "sites") {
					getElement(`${id}${set}`).value = val.replace(/\s+/g, "\n");
				} else if (name == "conjMode") {
					getElement(`${id}${set}`).selectedIndex = val ? 1 : 0;
				} else if (type == "boolean") {
					getElement(`${id}${set}`).checked = val;
				} else if (type == "string") {
					getElement(`${id}${set}`).value = val;
				} else if (type == "array") {
					for (let i = 0; i < val.length; i++) {
						getElement(`${id}${i}${set}`).checked = val[i];
					}
				}
			}

			// Apply custom set name to tab (if specified)
			let setName = options[`setName${set}`];
			if (setName) {
				getElement(`blockSetName${set}`).innerText = setName;
			}
		}

		// General options
		for (let name in GENERAL_OPTIONS) {
			let type = GENERAL_OPTIONS[name].type;
			let id = GENERAL_OPTIONS[name].id;
			if (id) {
				if (type == "boolean") {
					getElement(id).checked = options[name];
				} else if (type == "string") {
					getElement(id).value = options[name];
				}
			}
		}

		if (gIsAndroid) {
			// Disable sync options (sync storage not supported on Android yet)
			getElement("syncStorage").disabled = true;
			getElement("exportOptionsSync").disabled = true;
			getElement("importOptionsSync").disabled = true;
			getElement("autoExportSync").disabled = true;
		}

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
		if (oa > 2) {
			code += createAccessCode(32);
		}
		if (oa > 3) {
			code += createAccessCode(64);
		}
		gAccessRequiredInput = code;
		displayAccessCode(code, options["accessCodeImage"]);
		$("#promptAccessCodeInput").val("");
		$("#promptAccessCode").dialog("open");
		$("#promptAccessCodeInput").focus();
	} else {
		gAccessConfirmed = true;
		$("#form").show({ effect: "fade" });
	}
}

// Display access code (as text or image)
//
function displayAccessCode(code, asImage) {
	let codeText = getElement("promptAccessCodeText");
	let codeImage = getElement("promptAccessCodeImage");
	let codeCanvas = getElement("promptAccessCodeCanvas");

	if (asImage) {
		// Display code as image
		codeText.style.display = "none";
		codeImage.style.display = "";
		let ctx = codeCanvas.getContext("2d");
		ctx.font = "normal 14px monospace";
		codeCanvas.width = ctx.measureText(code.substring(0, 64)).width + 8;
		codeCanvas.height = (code.length == 128) ? 40 : 24;
		ctx.font = "normal 14px monospace"; // resizing canvas resets font!
		ctx.fillStyle = "#000";
		if (code.length == 128) {
			ctx.fillText(code.substring(0, 64), 4, 16);
			ctx.fillText(code.substring(64), 4, 32);
		} else {
			ctx.fillText(code, 4, 16);
		}
	} else {
		// Display code as text
		codeText.style.display = "";
		codeImage.style.display = "none";
		if (code.length == 128) {
			codeText.appendChild(document.createTextNode(code.substring(0, 64)));
			codeText.appendChild(document.createElement("br"));
			codeText.appendChild(document.createTextNode(code.substring(64)));
		} else {
			codeText.appendChild(document.createTextNode(code));
		}
	}
}

// Show adjusted time based on clock offset
//
function showClockOffsetTime() {
	let clockOffset = $("#clockOffset").val();
	if (!clockOffset || !checkPosNegIntFormat(clockOffset)) {
		$("#clockOffsetTime").css("display", "none");
	} else {
		let timedate = new Date(Date.now() + (clockOffset * 60000));
		$("#clockOffsetTime").html(timedate.toLocaleString());
		$("#clockOffsetTime").css("display", "inline");
	}
}

// Compile options for export
//
function compileExportOptions() {
	let options = {};

	// Per-set options
	for (let set = 1; set <= gNumSets; set++) {
		for (let name in PER_SET_OPTIONS) {
			let type = PER_SET_OPTIONS[name].type;
			let id = PER_SET_OPTIONS[name].id;

			// Set option value
			if (name == "sites") {
				let sites = cleanSites(getElement(`${id}${set}`).value);
				options[`${name}${set}`] = sites;
			} else if (name == "times") {
				let times = cleanTimePeriods(getElement(`${id}${set}`).value);
				options[`${name}${set}`] = times;
			} else if (name == "conjMode") {
				options[`${name}${set}`] = getElement(`${id}${set}`).selectedIndex == 1;
			} else if (type == "boolean") {
				options[`${name}${set}`] = getElement(`${id}${set}`).checked;
			} else if (type == "string") {
				options[`${name}${set}`] = getElement(`${id}${set}`).value;
			} else if (type == "array") {
				let val = PER_SET_OPTIONS[name].def.slice();
				for (let i = 0; i < val.length; i++) {
					val[i] = getElement(`${id}${i}${set}`).checked;
				}
				options[`${name}${set}`] = val;
			}
		}
	}

	// General options
	for (let name in GENERAL_OPTIONS) {
		let type = GENERAL_OPTIONS[name].type;
		let id = GENERAL_OPTIONS[name].id;
		if (id) {
			if (type == "boolean") {
				options[name] = getElement(id).checked;
			} else if (type == "string") {
				options[name] = getElement(id).value;
			}
		}
	}

	return options;
}

// Apply imported options
//
function applyImportOptions(options) {
	// Initialize form
	initForm(options["numSets"]);

	// Per-set options
	for (let set = 1; set <= gNumSets; set++) {
		for (let name in PER_SET_OPTIONS) {
			let type = PER_SET_OPTIONS[name].type;
			let id = PER_SET_OPTIONS[name].id;
			let val = options[`${name}${set}`];

			if (val != undefined) {
				// Set component value
				if (name == "sites") {
					getElement(`${id}${set}`).value = val.replace(/\s+/g, "\n");
				} else if (name == "conjMode") {
					getElement(`${id}${set}`).selectedIndex = val ? 1 : 0;
				} else if (type == "boolean") {
					getElement(`${id}${set}`).checked = val;
				} else if (type == "string") {
					getElement(`${id}${set}`).value = val;
				} else if (type == "array") {
					for (let i = 0; i < val.length; i++) {
						getElement(`${id}${i}${set}`).checked = val[i];
					}
				}
			}
		}

		// Apply custom set name to tab (if specified)
		let setName = options[`setName${set}`];
		if (setName) {
			getElement(`blockSetName${set}`).innerText = setName;
		}
	}

	// General options
	for (let name in GENERAL_OPTIONS) {
		let type = GENERAL_OPTIONS[name].type;
		let id = GENERAL_OPTIONS[name].id;
		if (id && options[name] != undefined) {
			if (type == "boolean") {
				getElement(id).checked = options[name];
			} else if (type == "string") {
				getElement(id).value = options[name];
			}
		}
	}
}

// Export options to file
//
function exportOptions() {
	let options = compileExportOptions();

	// Convert options to text lines
	let lines = [];
	for (let option in options) {
		let value = options[option];
		if (/^days\d+$/.test(option)) {
			lines.push(option + "=" + encodeDays(value) + "\n");
		} else {
			lines.push(option + "=" + value + "\n");
		}
	}

	// Create blob and download it
	let blob = new Blob(lines, { type: "text/plain", endings: "native" });
	var url = URL.createObjectURL(blob);
	let downloadOptions = { url: url, filename: DEFAULT_OPTIONS_FILE };
	if (!gIsAndroid) {
		downloadOptions.saveAs = true;
	}
	browser.downloads.download(downloadOptions).then(onSuccess, onError);

	function onSuccess() {
		$("#alertExportSuccess").dialog("open");
	}

	function onError(error) {
		warn("Cannot download options: " + error);
		$("#alertExportError").dialog("open");
	}
}

// Import options from file
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
			$("#alertImportError").dialog("open");
			return;
		}

		// Extract options from text
		let regexp = /^(\w+)=(.*)$/;
		let lines = text.split(/[\n\r]+/);
		let options = {};
		let hasOptions = false;
		for (let line of lines) {
			let results = regexp.exec(line);
			if (results) {
				let option = results[1];
				let value = results[2];
				if (/^days\d+$/.test(option)) {
					options[option] = decodeDays(value);
				} else if (/^(true|false)$/.test(value)) {
					options[option] = isTrue(value);
				} else {
					options[option] = value;
				}
				hasOptions = true;
			}
		}

		if (!hasOptions) {
			$("#alertImportError").dialog("open");
			return;
		}

		cleanOptions(options);
		applyImportOptions(options);

		$("#tabs").tabs("option", "active", gNumSets);
		$("#alertImportSuccess").dialog("open");
	}
}

// Export options to sync storage
//
function exportOptionsSync(event) {
	let options = compileExportOptions();

	browser.storage.sync.set(options).then(onSuccess, onError);

	function onSuccess() {
		if (event) {
			$("#alertExportSuccess").dialog("open");
		}
	}

	function onError(error) {
		warn("Cannot export options to sync storage: " + error);
		if (event) {
			$("#alertExportSyncError").dialog("open");
		}
	};
}

// Import options from sync storage
//
function importOptionsSync(event) {
	browser.storage.sync.get().then(onGot, onError);

	function onGot(options) {
		cleanOptions(options);
		applyImportOptions(options);

		if (event) {
			$("#tabs").tabs("option", "active", gNumSets);
			$("#alertImportSuccess").dialog("open");
		}
	}

	function onError(error) {
		warn("Cannot import options from sync storage: " + error);
		if (event) {
			$("#alertImportSyncError").dialog("open");
		}
	}
}

// Reset options for block set to defaults
//
function resetSetOptions(set) {
	// Restore default set name to tab
	getElement(`blockSetName${set}`).innerText = `Block Set ${set}`;

	// Restore per-set options
	for (let name in PER_SET_OPTIONS) {
		let type = PER_SET_OPTIONS[name].type;
		let id = PER_SET_OPTIONS[name].id;
		let val = PER_SET_OPTIONS[name].def;

		// Set component value
		if (name == "conjMode") {
			getElement(`${id}${set}`).selectedIndex = val ? 1 : 0;
		} else if (type == "boolean") {
			getElement(`${id}${set}`).checked = val;
		} else if (type == "string") {
			getElement(`${id}${set}`).value = val;
		} else if (type == "array") {
			for (let i = 0; i < val.length; i++) {
				getElement(`${id}${i}${set}`).checked = val[i];
			}
		}
	}
}

// Disable options for block set
//
function disableSetOptions(set) {
	// Disable per-set options
	for (let name in PER_SET_OPTIONS) {
		let type = PER_SET_OPTIONS[name].type;
		let id = PER_SET_OPTIONS[name].id;
		if (type == "array") {
			let def = PER_SET_OPTIONS[name].def;
			for (let i = 0; i < def.length; i++) {
				getElement(`${id}${i}${set}`).disabled = true;
			}
		} else {
			getElement(`${id}${set}`).disabled = true;
		}
	}

	// Disable buttons
	let items = [
		"resetOpts",
		"allDay",
		"defaultPage", "delayingPage", "blankPage",
		"clearRegExpBlock", "genRegExpBlock",
		"clearRegExpAllow", "genRegExpAllow",
		"cancelLockdown"
	];
	for (let item of items) {
		getElement(`${item}${set}`).disabled = true;
	}
}

// Disable general options
//
function disableGeneralOptions() {
	// Disable all general options
	let items = [
		"numSets",
		"optionsAccess", "accessPassword", "hidePassword",
		"timerVisible", "timerSize", "timerLocation", "timerBadge",
		"warnSecs", "warnImmediate",
		"overrideMins", "overrideAccess", "overrideConfirm",
		"theme", "contextMenu", "toolsMenu", "matchSubdomains",
		"saveSecs", "processActiveTabs", "accessCodeImage", "syncStorage",
		"exportOptions", "importOptions", "importFile",
		"exportOptionsSync", "importOptionsSync", "autoExportSync"
	];
	for (let item of items) {
		getElement(item).disabled = true;
	}
}

// Disable import options
//
function disableImportOptions() {
	// Disable all import options
	let items = [
		"importOptions", "importFile", "importOptionsSync"
	];
	for (let item of items) {
		getElement(item).disabled = true;
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

// Handle keydown event
//
function handleKeyDown(event) {
	if (event.ctrlKey && event.which == 83) {
		event.preventDefault();
		if (!event.shiftKey) {
			// Ctrl+S -> Save Options
			$("#saveOptions").click();
		} else {
			// Ctrl+Shift+S -> Save Options & Close
			$("#saveOptionsClose").click();
		}
	}
}

/*** STARTUP CODE BEGINS HERE ***/

browser.runtime.getPlatformInfo().then(
	function (info) { gIsAndroid = (info.os == "android"); }
);

// Save original HTML of form
gFormHTML = $("#form").html();

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

window.addEventListener("keydown", handleKeyDown);
