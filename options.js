/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

// Save options to local storage
//
function saveOptions(e) {
	//log("saveOptions");

	e.preventDefault();

	// Check format for text fields
	for (let set = 1; set <= NUM_SETS; set++) {
		// Get field values
		let times = document.querySelector(`#times${set}`).value;
		let limitMins = document.querySelector(`#limitMins${set}`).value;
		let delaySecs = document.querySelector(`#delaySecs${set}`).value;
		let blockURL = document.querySelector(`#blockURL${set}`).value;
		let parsedURL = getParsedURL(blockURL);

		// Check field values
		if (!checkTimePeriodsFormat(times)) {
			$("#panes").accordion("option", "active", (set - 1));
			$("#alertBadTimes").dialog("open");
			return;
		}
		if (!checkPosIntFormat(limitMins)) {
			$("#panes").accordion("option", "active", (set - 1));
			$("#alertBadTimeLimit").dialog("open");
			return;
		}
		if (!delaySecs || !checkPosIntFormat(delaySecs)) {
			$("#panes").accordion("option", "active", (set - 1));
			$("#alertBadSeconds").dialog("open");
			return;
		}
		if (blockURL != DEFAULT_BLOCK_URL && !parsedURL.page) {
			$("#panes").accordion("option", "active", (set - 1));
			$("#alertBadBlockURL").dialog("open");
			return;
		}
	}
	
	let options = {};

	for (let set = 1; set <= NUM_SETS; set++) {
		// Get component values
		let setName = document.querySelector(`#setName${set}`).value;
		let sites = document.querySelector(`#sites${set}`).value;
		sites = sites.replace(/\s+/g, " ").replace(/(^ +)|( +$)|(\w+:\/+)/g, "");
		sites = sites.split(" ").sort().join(" "); // sort alphabetically
		//let sitesURL = document.querySelector(`#sitesURL${set}`).value;
		let times = document.querySelector(`#times${set}`).value;
		let limitMins = document.querySelector(`#limitMins${set}`).value;
		let limitPeriod = document.querySelector(`#limitPeriod${set}`).value;
		let conjMode = document.querySelector(`#conjMode${set}`).selectedIndex == 1;
		let days = [];
		for (let i = 0; i < 7; i++) {
			days.push(document.querySelector(`#day${i}${set}`).checked);
		}
		let blockURL = document.querySelector(`#blockURL${set}`).value;
		let activeBlock = document.querySelector(`#activeBlock${set}`).checked;
		let countFocus = document.querySelector(`#countFocus${set}`).checked;
		let delayFirst = document.querySelector(`#delayFirst${set}`).checked;
		let delaySecs = document.querySelector(`#delaySecs${set}`).value;
		let prevOpts = document.querySelector(`#prevOpts${set}`).checked;
		let prevAddons = document.querySelector(`#prevAddons${set}`).checked;
		let prevConfig = document.querySelector(`#prevConfig${set}`).checked;

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
		options[`prevConfig${set}`] = prevConfig;
		options[`blockRE${set}`] = regexps.block;
		options[`allowRE${set}`] = regexps.allow;
		options[`keywordRE${set}`] = regexps.keyword;
	}

	browser.storage.local.set(options);

	$("#form").hide("fade");

	// Notify extension that options have been updated
	browser.runtime.sendMessage({ type: "options" });

	retrieveOptions();

	$("#form").show("fade");
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
			let prevConfig = options[`prevConfig${set}`];
			
			// Append custom set name to panel heading (if specified)
			if (setName) {
				document.querySelector(`#blockSetCustomName${set}`).innerText = ` (${setName})`;
			} else {
				document.querySelector(`#blockSetCustomName${set}`).innerText = "";
			}

			// Set component values
			document.querySelector(`#setName${set}`).value = setName;
			document.querySelector(`#sites${set}`).value = sites;
			document.querySelector(`#times${set}`).value = times;
			document.querySelector(`#limitMins${set}`).value = limitMins;
			document.querySelector(`#limitPeriod${set}`).value = limitPeriod;
			document.querySelector(`#conjMode${set}`).selectedIndex = conjMode ? 1 : 0;
			for (let i = 0; i < 7; i++) {
				document.querySelector(`#day${i}${set}`).checked = days[i];
			}
			document.querySelector(`#blockURL${set}`).value = blockURL;
			document.querySelector(`#activeBlock${set}`).checked = activeBlock;
			document.querySelector(`#countFocus${set}`).checked = countFocus;
			document.querySelector(`#delayFirst${set}`).checked = delayFirst;
			document.querySelector(`#delaySecs${set}`).value = delaySecs;
			document.querySelector(`#prevOpts${set}`).checked = prevOpts;
			document.querySelector(`#prevAddons${set}`).checked = prevAddons;
			document.querySelector(`#prevConfig${set}`).checked = prevConfig;
		}
	}

	function onError(error) {
		warn("Cannot get options: " + error);
	}
}

// Disables options for block set
//
function disableSetOptions(set) {
	let items = [
		"setName", "sites", "times", "allDay", "limitMins", "limitPeriod", "conjMode",
		"day0", "day1", "day2", "day3", "day4", "day5", "day6",
		"blockURL", "defaultPage", "delayingPage", "blankPage", "homePage",
		"activeBlock", "countFocus", "delayFirst", "delaySecs",
		"prevOpts", "prevAddons", "prevConfig"
	];
	for (let item of items) {
		let element = document.querySelector(`#${item}${set}`);
		if (element) {
			element.disabled = true;
		}
	}
}

// Use HTML for first block set to create other block sets
let blockSetHTML = $("#panes").html();
for (let set = 2; set <= NUM_SETS; set++) {
	let newBlockSetHTML = blockSetHTML
			.replace(/Block Set 1/g, `Block Set ${set}`)
			.replace(/(id|for)="(\w+)1"/g, `$1="$2${set}"`);
	$("#panes").append(newBlockSetHTML);
}

// Set up JQuery UI widgets
$("#panes").accordion({
	collapsible: false,
	heightStyle: "content"
});
for (let set = 1; set <= NUM_SETS; set++) {
	//$(`#allDay${set}`).button();
	$(`#allDay${set}`).click(function (e) { $(`#times${set}`).val(ALL_DAY_TIMES); });
	//$(`#defaultPage${set}`).button();
	$(`#defaultPage${set}`).click(function (e) { $(`#blockURL${set}`).val(DEFAULT_BLOCK_URL); });
	//$(`#delayingPage${set}`).button();
	$(`#delayingPage${set}`).click(function (e) { $(`#blockURL${set}`).val(DELAYED_BLOCK_URL); });
	//$(`#blankPage${set}`).button();
	$(`#blankPage${set}`).click(function (e) { $(`#blockURL${set}`).val("about:blank"); });
	//$(`#homePage${set}`).button();
	$(`#homePage${set}`).click(function (e) { $(`#blockURL${set}`).val("about:home"); });
}
$("#saveOptions").button();
$("#saveOptions").click(saveOptions);

let alerts = ["alertBadTimes", "alertBadTimeLimit", "alertBadSeconds", "alertBadBlockURL"];
for (let alert of alerts) {
	$(`#${alert}`).dialog({
		autoOpen: false,
		modal: true,
		buttons: {
			OK: function() { $(this).dialog("close"); }
		}
	});
}

$("#form").show();

document.addEventListener("DOMContentLoaded", retrieveOptions);
