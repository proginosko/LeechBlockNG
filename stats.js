/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

function getElement(id) { return document.getElementById(id); }

var gFormHTML;
var gNumSets;
var gClockTimeOpts;

// Initialize form (with specified number of block sets)
//
function initForm(numSets) {
	//log("initForm: " + numSets);

	// Reset form to original HTML
	$("#form").html(gFormHTML);

	gNumSets = +numSets;

	// Use HTML for first row to create other rows
	let rowHTML = $("#statsRow1").html();
	for (let set = 2; set <= gNumSets; set++) {
		let nextRowHTML = rowHTML
				.replace(/(Block Set) 1/g, `$1 ${set}`)
				.replace(/id="(\w+)1"/g, `id="$1${set}"`);
		$("#statsTable").append(`<tr id="statsRow${set}">${nextRowHTML}</tr>`);
	}

	$(":button").click(handleClick);
}

// Refresh page
//
function refreshPage() {
	//log("refreshPage");

	$("#form").hide();

	browser.storage.local.get("sync").then(onGotSync, onError);

	function onGotSync(options) {
		if (options["sync"]) {
			browser.storage.sync.get().then(onGot, onError);
		} else {
			browser.storage.local.get().then(onGot, onError);
		}
	}

	function onGot(options) {
		cleanOptions(options);
		cleanTimeData(options);

		// Initialize form
		initForm(options["numSets"]);

		setTheme(options["theme"]);

		// Get clock time format
		gClockTimeOpts = {};
		let clockTimeFormat = options["clockTimeFormat"];
		if (clockTimeFormat > 0) {
			gClockTimeOpts.hour12 = (clockTimeFormat == 1);
		}

		// Get current time in seconds
		let clockOffset = options["clockOffset"];
		let now = Math.floor(Date.now() / 1000) + (clockOffset * 60);

		for (let set = 1; set <= gNumSets; set++) {
			let setName = options[`setName${set}`];
			let timedata = options[`timedata${set}`];
			let limitMins = options[`limitMins${set}`];
			let limitPeriod = options[`limitPeriod${set}`];
			let limitOffset = options[`limitOffset${set}`];
			let periodStart = getTimePeriodStart(now, limitPeriod, limitOffset);
			let rollover = options[`rollover${set}`];

			updateRolloverTime(timedata, limitMins, limitPeriod, periodStart);

			if (setName) {
				getElement(`blockSetName${set}`).innerText = setName;
			}

			let fs = getFormattedStats(now, timedata);
			getElement(`startTime${set}`).innerText = fs.startTime;
			getElement(`totalTime${set}`).innerText = fs.totalTime;
			getElement(`perWeekTime${set}`).innerText = fs.perWeekTime;
			getElement(`perDayTime${set}`).innerText = fs.perDayTime;

			if (limitMins && limitPeriod) {
				// Calculate total seconds left in this time period
				let secsRollover = rollover ? timedata[5] : 0;
				let secsLeft = (timedata[2] == periodStart)
						? Math.max(0, secsRollover + (limitMins * 60) - timedata[3])
						: secsRollover + (limitMins * 60);
				let timeLeft = formatTime(secsLeft);
				getElement(`timeLeft${set}`).innerText = timeLeft;
				if (rollover) {
					let rolloverTime = formatTime(secsRollover);
					getElement(`rolloverTime${set}`).innerText = rolloverTime;
				}
			}

			if (timedata[4] > now) {
				let ldEndTime = getFormattedClockTime(timedata[4] * 1000);
				getElement(`ldEndTime${set}`).innerText = ldEndTime;
			}
		}

		$("#form").show();
	}

	function onError(error) {
		warn("Cannot get options: " + error);
	}
}

// Return formatted times based on time data
//
function getFormattedStats(now, timedata) {
	let days = 1
			+ Math.floor(now / 86400)
			- Math.floor(timedata[0] / 86400);
	let weeks = Math.floor((days + 6) / 7);
	return {
		startTime: getFormattedClockTime(timedata[0] * 1000),
		totalTime: formatTime(timedata[1]),
		perWeekTime: formatTime(timedata[1] / weeks),
		perDayTime: formatTime(timedata[1] / days)
	};
}

// Return clock time in desired format (12/24-hour)
//
function getFormattedClockTime(time) {
	return new Date(time).toLocaleString(undefined, gClockTimeOpts);
}

// Handle button click
//
function handleClick(e) {
	let id = e.target.id;

	if (id == "restartAll") {
		// Request restart time data for all sets
		let message = { type: "restart", set: 0 };
		browser.runtime.sendMessage(message).then(refreshPage);
	} else if (/restart\d+/.test(id)) {
		// Request restart time data for specific set
		let message = { type: "restart", set: +id.substr(7) };
		browser.runtime.sendMessage(message).then(refreshPage);
	}
}

/*** STARTUP CODE BEGINS HERE ***/

// Save original HTML of form
gFormHTML = $("#form").html();

document.addEventListener("DOMContentLoaded", refreshPage);
document.addEventListener("focus", refreshPage);
